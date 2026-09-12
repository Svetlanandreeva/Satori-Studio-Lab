import { sqlite } from "@/db";
import { createBackup } from "@/lib/backups";
import { getSetting, setSetting, sendTelegramMessage, INTEGRATION_KEYS } from "@/lib/satori-integrations";
import { listProjects } from "@/lib/projects";

const STATE_KEY = "__satoriOperationsScheduler";
const HEARTBEAT_KEY = "satori_ops_heartbeat";
const LAST_BACKUP_DAY = "satori_ops_last_backup_day";
const LAST_PROJECT_ALERT_DAY = "satori_ops_last_project_alert_day";

function moscowDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function escape(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function ensureDailyBackup() {
  const today = moscowDay();
  if (getSetting(LAST_BACKUP_DAY) === today) return;
  await createBackup("daily");
  setSetting(LAST_BACKUP_DAY, today);
}

async function alertDueTasks() {
  const token = getSetting(INTEGRATION_KEYS.telegramBotToken);
  const chatId = getSetting(INTEGRATION_KEYS.telegramChatId);
  if (!token || !chatId) return;

  const now = Date.now();
  const horizon = now + 15 * 60 * 1000;
  const tasks = sqlite.prepare(`SELECT a.id,a.description,a.scheduled_at AS scheduledAt,a.priority,c.name AS contactName
      FROM activities a JOIN contacts c ON c.id=a.contact_id
      WHERE a.completed_at IS NULL AND a.scheduled_at IS NOT NULL AND a.scheduled_at<=?
      ORDER BY a.scheduled_at ASC LIMIT 30`).all(horizon) as Array<{ id: string; description: string; scheduledAt: number; priority: string; contactName: string }>;

  for (const task of tasks) {
    const marker = `satori_ops_task_alert:${task.id}:${task.scheduledAt}`;
    if (getSetting(marker)) continue;
    const overdue = task.scheduledAt < now;
    const prefix = task.priority === "urgent" ? "🔴" : task.priority === "high" ? "🟠" : overdue ? "⚠️" : "⏰";
    const result = await sendTelegramMessage({
      token,
      chatId,
      text: `${prefix} <b>${overdue ? "Просроченная задача" : "Задача скоро"}</b>\n${escape(task.description)}\nКлиент: ${escape(task.contactName)}\nСрок: ${escape(formatDate(task.scheduledAt))}`,
      url: `https://crm.satorilabural.online/tasks`,
    });
    if (result.sent) setSetting(marker, new Date().toISOString());
  }
}

async function alertProjectDeadlines() {
  const today = moscowDay();
  if (getSetting(LAST_PROJECT_ALERT_DAY) === today) return;
  const token = getSetting(INTEGRATION_KEYS.telegramBotToken);
  const chatId = getSetting(INTEGRATION_KEYS.telegramChatId);
  if (!token || !chatId) return;

  const risky = (listProjects() as Array<Record<string, unknown>>)
    .filter((project) => ["overdue", "due_today", "due_soon"].includes(String(project.deadlineStatus || "")))
    .slice(0, 12);
  if (!risky.length) {
    setSetting(LAST_PROJECT_ALERT_DAY, today);
    return;
  }

  const lines = risky.map((project) => {
    const status = String(project.deadlineStatus) === "overdue"
      ? `просрочка ${Number(project.overdueDays || 0)} дн.`
      : String(project.deadlineStatus) === "due_today"
        ? "срок сегодня"
        : `осталось ${Number(project.daysRemaining || 0)} дн.`;
    return `• ${escape(project.title)} — ${escape(project.contactName)} · ${escape(status)}`;
  });
  const result = await sendTelegramMessage({
    token,
    chatId,
    text: `<b>Производство: требуют внимания</b>\n${lines.join("\n")}`,
    url: "https://crm.satorilabural.online/production",
  });
  if (result.sent) setSetting(LAST_PROJECT_ALERT_DAY, today);
}

async function tick() {
  setSetting(HEARTBEAT_KEY, new Date().toISOString());
  try { await ensureDailyBackup(); } catch (error) { console.error("CRM daily backup failed", error); }
  try { await alertDueTasks(); } catch (error) { console.error("CRM task alert failed", error); }
  try { await alertProjectDeadlines(); } catch (error) { console.error("CRM project alert failed", error); }
}

export function startOperationsScheduler() {
  const globalState = globalThis as typeof globalThis & { [STATE_KEY]?: NodeJS.Timeout };
  if (globalState[STATE_KEY]) return;
  void tick();
  globalState[STATE_KEY] = setInterval(() => void tick(), 60_000);
  globalState[STATE_KEY]?.unref?.();
}

export function operationsHeartbeat() {
  return getSetting(HEARTBEAT_KEY);
}
