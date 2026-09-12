import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { createHash } from "node:crypto";
import { getAssistantState, runAssistantAudit } from "@/lib/assistant";
import { sendTelegramMessage } from "@/lib/satori-integrations";
import { runCrmConsistencyRepair } from "@/lib/crm-consistency";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const sqlite = new Database(DB_PATH, { timeout: 15000 });
try { sqlite.pragma("journal_mode = WAL"); } catch {}
try { sqlite.pragma("busy_timeout = 15000"); } catch {}

function tableExists(name: string): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function epochMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value > 0 && value < 10_000_000_000 ? value * 1000 : value;
  const text = String(value || "").trim();
  if (!text) return 0;
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hoursSince(value: unknown): number {
  const time = epochMs(value);
  if (!time) return 0;
  return Math.max(0, (Date.now() - time) / 3_600_000);
}

function daysSince(value: unknown): number {
  return Math.floor(hoursSince(value) / 24);
}

function resolve(id: string) {
  sqlite.prepare("UPDATE assistant_insights SET status='resolved', updated_at=? WHERE id=?").run(Date.now(), id);
}

function updateDetail(id: string, detail: string) {
  sqlite.prepare("UPDATE assistant_insights SET detail=?, updated_at=? WHERE id=?").run(detail, Date.now(), id);
}

function activeDealsFor(contactId: string) {
  return sqlite.prepare(`
    SELECT d.id, d.created_at AS createdAt, d.updated_at AS updatedAt, ps.name AS stageName
    FROM deals d
    JOIN pipeline_stages ps ON ps.id=d.stage_id
    WHERE d.contact_id=? AND COALESCE(ps.is_won,0)=0 AND COALESCE(ps.is_lost,0)=0
  `).all(contactId) as Array<{ id: string; createdAt: unknown; updatedAt: unknown; stageName: string }>;
}

function rejectedStage(stageName: unknown, isLost: unknown): boolean {
  if (Number(isLost || 0) === 1) return true;
  const name = String(stageName || "").trim().toLowerCase().replace(/ё/g, "е");
  return name.includes("отказ") || name.includes("спам") || name.includes("песочниц");
}

function rejectedConversationState(contactId: string): { rejected: boolean; rejectedAt: number } {
  if (!contactId || !tableExists("deals") || !tableExists("pipeline_stages")) {
    return { rejected: false, rejectedAt: 0 };
  }

  const rows = sqlite.prepare(`
    SELECT d.id, d.updated_at AS updatedAt, d.created_at AS createdAt,
      ps.name AS stageName, ps.is_lost AS isLost, ps.is_won AS isWon
    FROM deals d
    JOIN pipeline_stages ps ON ps.id=d.stage_id
    WHERE d.contact_id=?
    ORDER BY d.updated_at DESC, d.created_at DESC
  `).all(contactId) as Array<{
    id: string;
    updatedAt: unknown;
    createdAt: unknown;
    stageName: string;
    isLost: unknown;
    isWon: unknown;
  }>;

  if (!rows.length) return { rejected: false, rejectedAt: 0 };
  const hasActive = rows.some((row) => !Number(row.isWon || 0) && !rejectedStage(row.stageName, row.isLost));
  if (hasActive) return { rejected: false, rejectedAt: 0 };

  const latest = rows[0];
  if (!rejectedStage(latest.stageName, latest.isLost)) return { rejected: false, rejectedAt: 0 };

  let rejectedAt = 0;
  if (tableExists("deal_stage_history")) {
    const history = sqlite.prepare(`
      SELECT MAX(h.created_at) AS rejectedAt
      FROM deal_stage_history h
      JOIN pipeline_stages ps ON ps.id=h.to_stage_id
      WHERE h.deal_id=? AND (
        COALESCE(ps.is_lost,0)=1 OR
        lower(COALESCE(ps.name,'')) LIKE '%отказ%' OR
        lower(COALESCE(ps.name,'')) LIKE '%спам%' OR
        lower(COALESCE(ps.name,'')) LIKE '%песочниц%'
      )
    `).get(latest.id) as { rejectedAt?: unknown } | undefined;
    rejectedAt = epochMs(history?.rejectedAt);
  }
  if (!rejectedAt) rejectedAt = epochMs(latest.updatedAt) || epochMs(latest.createdAt);
  return { rejected: true, rejectedAt };
}

function isPostSaleStage(stageName: string): boolean {
  return /согласовано|в производстве|готово|отправлен клиенту|доставка|завершено/i.test(String(stageName || ""));
}

function sanitizeStaleClient(insight: Record<string, unknown>) {
  const id = String(insight.id || "");
  const contactId = String(insight.entityId || insight.entity_id || "");
  if (!id || !contactId) return;
  const active = activeDealsFor(contactId);
  if (!active.length || active.some((deal) => isPostSaleStage(deal.stageName))) {
    resolve(id);
    return;
  }

  const contact = sqlite.prepare("SELECT created_at AS createdAt, updated_at AS updatedAt FROM contacts WHERE id=?").get(contactId) as Record<string, unknown> | undefined;
  const activities = sqlite.prepare("SELECT created_at AS createdAt FROM activities WHERE contact_id=?").all(contactId) as Array<Record<string, unknown>>;
  const moments = [
    epochMs(contact?.createdAt), epochMs(contact?.updatedAt),
    ...active.flatMap((deal) => [epochMs(deal.createdAt), epochMs(deal.updatedAt)]),
    ...activities.map((row) => epochMs(row.createdAt)),
  ].filter((value) => value > 0);
  const latest = moments.length ? Math.max(...moments) : 0;
  const days = latest ? daysSince(latest) : 0;
  if (!latest || days < 5) {
    resolve(id);
    return;
  }
  updateDetail(id, `Есть активная сделка на этапе продажи, но движения нет ${days} дн. Стоит уточнить статус решения.`);
}

function sanitizeMessageInsight(insight: Record<string, unknown>) {
  const id = String(insight.id || "");
  const fingerprint = String(insight.fingerprint || "");
  const activityId = fingerprint.split(":").pop() || "";
  if (!id || !activityId) return;
  const activity = sqlite.prepare("SELECT contact_id AS contactId, created_at AS createdAt FROM activities WHERE id=?").get(activityId) as Record<string, unknown> | undefined;
  if (!activity) {
    resolve(id);
    return;
  }

  const contactId = String(insight.entityId || insight.entity_id || activity.contactId || "");
  const rejected = rejectedConversationState(contactId);
  if (rejected.rejected) {
    const messageAt = epochMs(activity.createdAt);
    // Всё, что было до перевода последней заявки в «Отказ»/спам, считается закрытой
    // перепиской и больше не должно превращаться в текущий follow-up.
    // Если клиент написал уже ПОСЛЕ отказа, это новое обращение и его не скрываем.
    if (!rejected.rejectedAt || !messageAt || messageAt <= rejected.rejectedAt) {
      resolve(id);
      return;
    }
  }

  const age = hoursSince(activity.createdAt);
  if (fingerprint.startsWith("unanswered:")) {
    if (age < 6) return resolve(id);
    updateDetail(id, `Последнее входящее сообщение без ответа около ${Math.floor(age)} ч. назад.`);
  } else if (fingerprint.startsWith("followup:")) {
    if (age < 48) return resolve(id);
    updateDetail(id, `После нашего сообщения нет ответа ${Math.floor(age / 24)} дн. Стоит мягко уточнить статус решения.`);
  }
}

function sanitizeOverdueActivity(insight: Record<string, unknown>) {
  const id = String(insight.id || "");
  const fingerprint = String(insight.fingerprint || "");
  const activityId = fingerprint.replace(/^overdue-activity:/, "");
  if (!id || !activityId) return;
  const activity = sqlite.prepare("SELECT contact_id AS contactId, scheduled_at AS scheduledAt, completed_at AS completedAt FROM activities WHERE id=?").get(activityId) as Record<string, unknown> | undefined;
  if (!activity || activity.completedAt || !epochMs(activity.scheduledAt) || epochMs(activity.scheduledAt) >= Date.now()) {
    resolve(id);
    return;
  }
  const rejected = rejectedConversationState(String(activity.contactId || ""));
  if (rejected.rejected) resolve(id);
}

export function sanitizeAssistantInsights() {
  const rows = sqlite.prepare(`
    SELECT id,fingerprint,entity_id AS entityId FROM assistant_insights
    WHERE status='open' AND (
      fingerprint LIKE 'stale-client:%' OR fingerprint LIKE 'unanswered:%' OR
      fingerprint LIKE 'followup:%' OR fingerprint LIKE 'overdue-activity:%'
    )
  `).all() as Array<Record<string, unknown>>;

  for (const insight of rows) {
    const fingerprint = String(insight.fingerprint || "");
    if (fingerprint.startsWith("stale-client:")) sanitizeStaleClient(insight);
    else if (fingerprint.startsWith("unanswered:") || fingerprint.startsWith("followup:")) sanitizeMessageInsight(insight);
    else if (fingerprint.startsWith("overdue-activity:")) sanitizeOverdueActivity(insight);
  }
}

async function notifySanitizedState() {
  const state = getAssistantState();
  const critical = state.insights.filter((item) => String(item.severity) === "critical");
  if (!critical.length) return;
  const top = state.insights.slice(0, 6);
  const text = [
    "🧭 <b>SATORI CRM · помощник</b>",
    `Критично: <b>${critical.length}</b> · требует внимания: <b>${state.insights.filter((item) => String(item.severity) === "warning").length}</b>`,
    ...top.map((item) => `${String(item.severity) === "critical" ? "🔴" : "🟠"} ${String(item.title || "")}`),
  ].join("\n");
  const hash = createHash("sha256").update(text).digest("hex");
  const prev = sqlite.prepare("SELECT value FROM crm_settings WHERE key='satori_assistant_last_alert_hash'").get() as { value?: string } | undefined;
  if (prev?.value === hash) return;
  await sendTelegramMessage({ text, url: "https://crm.satorilabural.online/assistant" }).catch(() => null);
  sqlite.prepare(`INSERT INTO crm_settings(key,value) VALUES('satori_assistant_last_alert_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(hash);
}

export async function runAssistantSafely(options: { notify?: boolean } = {}) {
  // Сначала выравниваем структуру CRM, затем строим управленческие сигналы.
  // Это не даёт старым интеграциям снова разнести «Доставка» и «Отправлен клиенту».
  runCrmConsistencyRepair();
  await runAssistantAudit({ notify: false });
  runCrmConsistencyRepair();
  sanitizeAssistantInsights();
  if (options.notify) await notifySanitizedState();
  return getAssistantState();
}

export function getSanitizedAssistantState() {
  runCrmConsistencyRepair();
  sanitizeAssistantInsights();
  return getAssistantState();
}
