import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { createHash } from "node:crypto";
import { listProjects } from "@/lib/projects";
import { sendTelegramMessage } from "@/lib/satori-integrations";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const sqlite = new Database(DB_PATH, { timeout: 15000 });
try { sqlite.pragma("journal_mode = WAL"); } catch {}
try { sqlite.pragma("busy_timeout = 15000"); } catch {}
try { sqlite.pragma("foreign_keys = ON"); } catch {}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS assistant_runs (
    id TEXT PRIMARY KEY,
    run_at INTEGER NOT NULL,
    cleaned_duplicates INTEGER NOT NULL DEFAULT 0,
    cleaned_activity_duplicates INTEGER NOT NULL DEFAULT 0,
    critical_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    summary_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_assistant_runs_at ON assistant_runs(run_at DESC);

  CREATE TABLE IF NOT EXISTS assistant_insights (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL UNIQUE,
    severity TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    action_url TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_assistant_insights_status ON assistant_insights(status, severity, updated_at DESC);

  CREATE TABLE IF NOT EXISTS channel_spend (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    month TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_channel_spend_month ON channel_spend(month, channel);
`);

export type AssistantSeverity = "critical" | "warning" | "info";
export type AssistantCategory = "clients" | "messages" | "projects" | "finance" | "channels" | "crm";

export interface AssistantInsightInput {
  severity: AssistantSeverity;
  category: AssistantCategory;
  title: string;
  detail: string;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  fingerprint: string;
}

function tableExists(name: string): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function columnExists(table: string, column: string): boolean {
  if (!tableExists(table)) return false;
  return (sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((x) => x.name === column);
}

function normalizePhone(value: unknown): string | null {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits.length >= 10 ? digits : null;
}

function normalizeEmail(value: unknown): string | null {
  const email = String(value || "").trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

function normalizeName(value: unknown): string {
  return String(value || "").toLowerCase().replace(/[^a-zа-яё0-9]+/gi, " ").trim();
}

function placeholderName(name: string): boolean {
  return /need number|telegram|покупатель сайта|клиент|без имени/i.test(name);
}

function money(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function formatMoney(value: number): string {
  return `${Math.round(value / 100).toLocaleString("ru-RU")} ₽`;
}

function moscowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((x) => x.type === "year")?.value || "1970";
  const month = parts.find((x) => x.type === "month")?.value || "01";
  const day = parts.find((x) => x.type === "day")?.value || "01";
  return { date: `${year}-${month}-${day}`, month: `${year}-${month}` };
}

function daysSince(value: unknown): number {
  const time = value instanceof Date ? value.getTime() : typeof value === "number" ? value : new Date(String(value || "")).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.floor((Date.now() - time) / 86_400_000);
}

function severityRank(value: string) {
  return value === "critical" ? 0 : value === "warning" ? 1 : 2;
}

function qualificationRank(value: unknown) {
  const ranks: Record<string, number> = { qualified: 5, new: 4, unqualified: 3, ignore: 2, spam: 1 };
  return ranks[String(value || "new")] || 0;
}

function temperatureRank(value: unknown) {
  const ranks: Record<string, number> = { hot: 3, warm: 2, cold: 1 };
  return ranks[String(value || "cold")] || 0;
}

function safeDuplicate(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ap = normalizePhone(a.phone); const bp = normalizePhone(b.phone);
  const ae = normalizeEmail(a.email); const be = normalizeEmail(b.email);
  const an = normalizeName(a.name); const bn = normalizeName(b.name);
  const samePhone = Boolean(ap && bp && ap === bp);
  const sameEmail = Boolean(ae && be && ae === be);
  const sameName = Boolean(an && bn && an === bn);
  if (samePhone && sameEmail) return true;
  if (samePhone && (sameName || placeholderName(String(a.name || "")) || placeholderName(String(b.name || "")))) return true;
  if (sameEmail && (sameName || (!ap && !bp))) return true;
  return false;
}

function contactCompleteness(row: Record<string, unknown>): number {
  let score = 0;
  if (row.name && !placeholderName(String(row.name))) score += 5;
  if (row.phone) score += 3;
  if (row.email) score += 3;
  if (row.company) score += 2;
  if (row.notes) score += Math.min(4, Math.ceil(String(row.notes).length / 200));
  score += Number(row.dealCount || 0) * 2 + Number(row.activityCount || 0);
  return score;
}

function mergeNotes(primary: unknown, duplicate: unknown): string | null {
  const a = String(primary || "").trim();
  const b = String(duplicate || "").trim();
  if (!b || a.includes(b)) return a || null;
  if (!a) return b;
  return `${a}\n\n[объединено помощником CRM]\n${b}`;
}

function cleanupSafeDuplicates(): number {
  const hasQualification = columnExists("contacts", "qualification");
  const contacts = sqlite.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM deals d WHERE d.contact_id=c.id) AS dealCount,
      (SELECT COUNT(*) FROM activities a WHERE a.contact_id=c.id) AS activityCount
    FROM contacts c ORDER BY c.created_at ASC
  `).all() as Array<Record<string, unknown>>;
  let merged = 0;
  const removed = new Set<string>();

  for (let i = 0; i < contacts.length; i++) {
    const a = contacts[i];
    if (removed.has(String(a.id))) continue;
    for (let j = i + 1; j < contacts.length; j++) {
      const b = contacts[j];
      if (removed.has(String(b.id)) || !safeDuplicate(a, b)) continue;
      let primary = a; let duplicate = b;
      if (contactCompleteness(b) > contactCompleteness(a)) { primary = b; duplicate = a; }
      const primaryId = String(primary.id); const duplicateId = String(duplicate.id);

      sqlite.transaction(() => {
        sqlite.prepare("UPDATE activities SET contact_id=? WHERE contact_id=?").run(primaryId, duplicateId);
        sqlite.prepare("UPDATE deals SET contact_id=? WHERE contact_id=?").run(primaryId, duplicateId);
        const fields: Record<string, unknown> = {
          name: placeholderName(String(primary.name || "")) && !placeholderName(String(duplicate.name || "")) ? duplicate.name : primary.name,
          email: primary.email || duplicate.email || null,
          phone: primary.phone || duplicate.phone || null,
          company: primary.company || duplicate.company || null,
          source: primary.source || duplicate.source || "other",
          temperature: temperatureRank(duplicate.temperature) > temperatureRank(primary.temperature) ? duplicate.temperature : primary.temperature,
          score: Math.max(Number(primary.score || 0), Number(duplicate.score || 0)),
          notes: mergeNotes(primary.notes, duplicate.notes),
          updatedAt: Date.now(),
        };
        if (hasQualification) {
          fields.qualification = qualificationRank(duplicate.qualification) > qualificationRank(primary.qualification)
            ? duplicate.qualification : primary.qualification;
        }
        const qualificationSet = hasQualification ? ", qualification=@qualification" : "";
        sqlite.prepare(`UPDATE contacts SET name=@name, email=@email, phone=@phone, company=@company,
          source=@source, temperature=@temperature, score=@score, notes=@notes, updated_at=@updatedAt${qualificationSet}
          WHERE id=@id`).run({ ...fields, id: primaryId });
        sqlite.prepare("DELETE FROM contacts WHERE id=?").run(duplicateId);
      })();

      removed.add(duplicateId);
      merged++;
      if (primary === b) contacts[i] = b;
    }
  }
  return merged;
}

function cleanupExactActivityDuplicates(): number {
  const rows = sqlite.prepare(`
    SELECT contact_id AS contactId, type, description, COALESCE(deal_id,'') AS dealId,
      created_at AS createdAt, COUNT(*) AS cnt
    FROM activities
    GROUP BY contact_id, type, description, COALESCE(deal_id,''), created_at
    HAVING COUNT(*) > 1
  `).all() as Array<{ contactId: string; type: string; description: string; dealId: string; createdAt: number; cnt: number }>;
  let deleted = 0;
  for (const row of rows) {
    const ids = sqlite.prepare(`SELECT id FROM activities WHERE contact_id=? AND type=? AND description=?
      AND COALESCE(deal_id,'')=? AND created_at=? ORDER BY rowid ASC`).all(row.contactId, row.type, row.description, row.dealId, row.createdAt) as Array<{ id: string }>;
    for (const item of ids.slice(1)) {
      sqlite.prepare("DELETE FROM activities WHERE id=?").run(item.id);
      deleted++;
    }
  }
  return deleted;
}

function upsertInsight(item: AssistantInsightInput, now: number) {
  sqlite.prepare(`
    INSERT INTO assistant_insights (id, fingerprint, severity, category, title, detail, entity_type, entity_id, action_url, status, created_at, updated_at)
    VALUES (@id,@fingerprint,@severity,@category,@title,@detail,@entityType,@entityId,@actionUrl,'open',@now,@now)
    ON CONFLICT(fingerprint) DO UPDATE SET
      severity=excluded.severity, category=excluded.category, title=excluded.title, detail=excluded.detail,
      entity_type=excluded.entity_type, entity_id=excluded.entity_id, action_url=excluded.action_url,
      status='open', updated_at=excluded.updated_at
  `).run({ id: crypto.randomUUID(), ...item, entityType: item.entityType || null, entityId: item.entityId || null, actionUrl: item.actionUrl || null, now });
}

function analyzeMessagesAndClients(insights: AssistantInsightInput[]) {
  const qualificationFilter = columnExists("contacts", "qualification") ? "AND COALESCE(c.qualification,'new') NOT IN ('spam','ignore')" : "";
  const contacts = sqlite.prepare(`SELECT c.* FROM contacts c WHERE 1=1 ${qualificationFilter}`).all() as Array<Record<string, unknown>>;
  const activities = sqlite.prepare("SELECT * FROM activities ORDER BY created_at DESC").all() as Array<Record<string, unknown>>;
  const stages = new Map((sqlite.prepare("SELECT * FROM pipeline_stages").all() as Array<Record<string, unknown>>).map(x => [String(x.id), x]));
  const deals = sqlite.prepare("SELECT * FROM deals").all() as Array<Record<string, unknown>>;

  for (const contact of contacts) {
    const id = String(contact.id);
    const acts = activities.filter(a => String(a.contact_id) === id);
    const comm = acts.filter(a => /telegram|email/i.test(String(a.type || "")));
    const incoming = comm.find(a => /incoming/i.test(String(a.type || "")));
    const outgoing = comm.find(a => /outgoing|sent/i.test(String(a.type || "")));
    if (incoming) {
      const newerOutgoing = outgoing && Number(outgoing.created_at) > Number(incoming.created_at);
      const ageHours = (Date.now() - Number(incoming.created_at)) / 3_600_000;
      if (!newerOutgoing && ageHours >= 6) {
        insights.push({ severity: ageHours >= 24 ? "critical" : "warning", category: "messages",
          title: `Нужно ответить: ${String(contact.name || "Клиент")}`,
          detail: `Последнее входящее сообщение без ответа около ${Math.floor(ageHours)} ч. назад.`,
          entityType: "contact", entityId: id, actionUrl: `/contacts/${id}`, fingerprint: `unanswered:${id}:${String(incoming.id)}` });
      }
    }
    if (outgoing) {
      const newerIncoming = incoming && Number(incoming.created_at) > Number(outgoing.created_at);
      const ageHours = (Date.now() - Number(outgoing.created_at)) / 3_600_000;
      if (!newerIncoming && ageHours >= 48) {
        insights.push({ severity: "warning", category: "clients", title: `Дожать статус: ${String(contact.name || "Клиент")}`,
          detail: `После нашего сообщения нет ответа ${Math.floor(ageHours / 24)} дн. Стоит мягко уточнить статус решения.`,
          entityType: "contact", entityId: id, actionUrl: `/contacts/${id}`, fingerprint: `followup:${id}:${String(outgoing.id)}` });
      }
    }

    const active = deals.filter(d => String(d.contact_id) === id).filter(d => {
      const stage = stages.get(String(d.stage_id)); return stage && !Number(stage.is_won) && !Number(stage.is_lost);
    });
    const lastAct = acts[0];
    if (active.length && (!lastAct || daysSince(lastAct.created_at) >= 5)) {
      insights.push({ severity: "warning", category: "clients", title: `Нет движения по клиенту: ${String(contact.name || "Клиент")}`,
        detail: `Есть активная сделка, но активности нет ${lastAct ? `${daysSince(lastAct.created_at)} дн.` : "с момента создания"}.`,
        entityType: "contact", entityId: id, actionUrl: `/contacts/${id}`, fingerprint: `stale-client:${id}` });
    }
  }

  const overdue = sqlite.prepare(`SELECT a.id, a.description, a.contact_id AS contactId, c.name AS contactName, a.scheduled_at AS scheduledAt
    FROM activities a JOIN contacts c ON c.id=a.contact_id
    WHERE a.scheduled_at IS NOT NULL AND a.completed_at IS NULL AND a.scheduled_at < ?`).all(Date.now()) as Array<Record<string, unknown>>;
  for (const item of overdue) {
    insights.push({ severity: "critical", category: "clients", title: `Просрочен follow-up: ${String(item.contactName || "Клиент")}`,
      detail: String(item.description || "Запланированное действие просрочено"), entityType: "contact", entityId: String(item.contactId),
      actionUrl: `/contacts/${String(item.contactId)}`, fingerprint: `overdue-activity:${String(item.id)}` });
  }
}

function analyzeProjectsAndFinance(insights: AssistantInsightInput[]) {
  const projects = listProjects() as Array<Record<string, unknown>>;
  const economicsIds = new Set(tableExists("deal_economics")
    ? (sqlite.prepare("SELECT deal_id AS id FROM deal_economics").all() as Array<{ id: string }>).map(x => x.id) : []);
  for (const p of projects) {
    const dealId = String(p.dealId || ""); const name = String(p.title || p.contactName || "Проект");
    const status = String(p.deadlineStatus || "");
    if (status === "overdue") {
      insights.push({ severity: "critical", category: "projects", title: `Просрочен проект: ${name}`,
        detail: `Просрочка ${Number(p.overdueDays || 0)} дн. Нужно обновить фактический статус и согласовать новый срок.`,
        entityType: "deal", entityId: dealId, actionUrl: "/projects", fingerprint: `project-overdue:${dealId}` });
    } else if (status === "due_today" || status === "due_soon") {
      insights.push({ severity: status === "due_today" ? "critical" : "warning", category: "projects", title: `Срок близко: ${name}`,
        detail: status === "due_today" ? "Срок по проекту сегодня." : `До срока ${Number(p.daysRemaining || 0)} дн.`,
        entityType: "deal", entityId: dealId, actionUrl: "/projects", fingerprint: `project-due:${dealId}` });
    }
    const received = money(p.receivedAmount); const profit = money(p.profit); const margin = Number(p.margin || 0);
    if (economicsIds.size && !economicsIds.has(dealId)) {
      insights.push({ severity: "warning", category: "finance", title: `Нет юнит-экономики: ${name}`,
        detail: "По проекту не заполнены поступления и затраты — маржу сейчас нельзя считать достоверной.",
        entityType: "deal", entityId: dealId, actionUrl: "/economics", fingerprint: `economics-missing:${dealId}` });
    } else if (received > 0 && profit < 0) {
      insights.push({ severity: "critical", category: "finance", title: `Проект в минусе: ${name}`,
        detail: `Текущая прибыль ${formatMoney(profit)}, маржа ${margin.toFixed(1)}%.`, entityType: "deal", entityId: dealId,
        actionUrl: "/economics", fingerprint: `negative-margin:${dealId}` });
    } else if (received > 0 && margin > 0 && margin < 25) {
      insights.push({ severity: "warning", category: "finance", title: `Низкая маржа: ${name}`,
        detail: `Маржа ${margin.toFixed(1)}%. Проверь производство, доставку, подрядчиков и комиссии.`, entityType: "deal", entityId: dealId,
        actionUrl: "/economics", fingerprint: `low-margin:${dealId}` });
    }
  }

  if (tableExists("business_expenses")) {
    const today = moscowParts().date;
    const expenses = sqlite.prepare(`SELECT * FROM business_expenses WHERE paid_at IS NULL AND due_date IS NOT NULL AND due_date <= date(?, '+3 day') ORDER BY due_date`).all(today) as Array<Record<string, unknown>>;
    for (const e of expenses) {
      const overdue = String(e.due_date) < today;
      insights.push({ severity: overdue ? "critical" : "warning", category: "finance",
        title: `${overdue ? "Просрочен" : "Скоро"} платёж: ${String(e.name || "Расход")}`,
        detail: `${formatMoney(money(e.amount))} · срок ${String(e.due_date)}`, actionUrl: "/economics",
        fingerprint: `expense-due:${String(e.id)}` });
    }
  }
}

function analyzeCrmQuality(insights: AssistantInsightInput[]) {
  const qualificationFilter = columnExists("contacts", "qualification") ? "WHERE COALESCE(qualification,'new') NOT IN ('spam','ignore')" : "";
  const contacts = sqlite.prepare(`SELECT * FROM contacts ${qualificationFilter}`).all() as Array<Record<string, unknown>>;
  const byPhone = new Map<string, Array<Record<string, unknown>>>();
  const byEmail = new Map<string, Array<Record<string, unknown>>>();
  for (const c of contacts) {
    const p = normalizePhone(c.phone); const e = normalizeEmail(c.email);
    if (p) byPhone.set(p, [...(byPhone.get(p) || []), c]);
    if (e) byEmail.set(e, [...(byEmail.get(e) || []), c]);
  }
  const suspicious = [...byPhone.values(), ...byEmail.values()].filter(g => g.length > 1 && !g.every((x, i) => i === 0 || safeDuplicate(g[0], x)));
  for (const group of suspicious.slice(0, 20)) {
    insights.push({ severity: "warning", category: "crm", title: "Возможный дубль клиентов требует проверки",
      detail: group.map(x => String(x.name || x.id)).join(" · "), actionUrl: "/contacts", fingerprint: `ambiguous-duplicate:${group.map(x => String(x.id)).sort().join(":")}` });
  }

  const emptyName = contacts.filter(c => !String(c.name || "").trim());
  if (emptyName.length) insights.push({ severity: "warning", category: "crm", title: `Клиенты без имени: ${emptyName.length}`,
    detail: "Карточки нужно дополнить, чтобы follow-up и отчёты были читаемыми.", actionUrl: "/contacts", fingerprint: "contacts-empty-name" });
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    need_number: "Парсер / Need Number", website: "Сайт", telegram: "Telegram-бот", telegram_account: "Личный Telegram",
    instagram: "Instagram", linkedin: "LinkedIn", ads: "Реклама", referral: "Рекомендации", other: "Другое", otro: "Другое",
  };
  return labels[source] || source || "Без источника";
}

function channelMetrics() {
  const { month } = moscowParts();
  const since30 = Date.now() - 30 * 86_400_000;
  const contactRows = sqlite.prepare(`SELECT id, source, created_at AS createdAt FROM contacts WHERE created_at >= ?`).all(since30) as Array<Record<string, unknown>>;
  const stages = new Map((sqlite.prepare("SELECT id,is_won AS isWon,is_lost AS isLost FROM pipeline_stages").all() as Array<Record<string, unknown>>).map(x => [String(x.id), x]));
  const deals = sqlite.prepare(`SELECT d.id,d.contact_id AS contactId,d.stage_id AS stageId,c.source,
      COALESCE(e.received_amount,0) AS revenue,
      COALESCE(e.production_cost,0)+COALESCE(e.payment_commission,0)+COALESCE(e.delivery_cost,0)+COALESCE(e.packaging_cost,0)+COALESCE(e.contractor_cost,0)+COALESCE(e.tax_cost,0)+COALESCE(e.other_cost,0) AS directCost
    FROM deals d JOIN contacts c ON c.id=d.contact_id LEFT JOIN deal_economics e ON e.deal_id=d.id`).all() as Array<Record<string, unknown>>;
  const spendRows = sqlite.prepare("SELECT channel, SUM(amount) AS amount FROM channel_spend WHERE month=? GROUP BY channel").all(month) as Array<{ channel: string; amount: number }>;
  const spendMap = new Map(spendRows.map(x => [x.channel, money(x.amount)]));
  const sources = new Set<string>([...contactRows.map(x => String(x.source || "other")), ...deals.map(x => String(x.source || "other")), ...spendRows.map(x => x.channel)]);
  return [...sources].map(source => {
    const leads = contactRows.filter(x => String(x.source || "other") === source).length;
    const sourceDeals = deals.filter(x => String(x.source || "other") === source);
    const won = sourceDeals.filter(x => Number(stages.get(String(x.stageId))?.isWon || 0)).length;
    const revenue = sourceDeals.reduce((sum, x) => sum + money(x.revenue), 0);
    const directProfit = sourceDeals.reduce((sum, x) => sum + money(x.revenue) - money(x.directCost), 0);
    const spend = spendMap.get(source) || 0;
    return {
      source, label: sourceLabel(source), leads, deals: sourceDeals.length, won, revenue, directProfit, spend,
      conversion: leads ? Math.round((won / leads) * 1000) / 10 : 0,
      cpl: leads && spend ? Math.round(spend / leads) : 0,
      cac: won && spend ? Math.round(spend / won) : 0,
      roas: spend ? Math.round((revenue / spend) * 100) / 100 : null,
    };
  }).sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);
}

function analyzeChannels(insights: AssistantInsightInput[], channels: ReturnType<typeof channelMetrics>) {
  for (const c of channels) {
    if (c.spend > 0 && c.leads === 0) insights.push({ severity: "critical", category: "channels", title: `Расход есть, лидов нет: ${c.label}`,
      detail: `За текущий месяц потрачено ${formatMoney(c.spend)}, лидов в CRM не зафиксировано.`, actionUrl: "/assistant", fingerprint: `channel-no-leads:${c.source}` });
    else if (c.spend > 0 && c.won === 0 && c.leads >= 3) insights.push({ severity: "warning", category: "channels", title: `Канал пока не конвертирует: ${c.label}`,
      detail: `${c.leads} лидов, ${formatMoney(c.spend)} расхода, закрытых продаж пока нет.`, actionUrl: "/assistant", fingerprint: `channel-no-sales:${c.source}` });
  }
}

export function saveChannelSpend(input: { channel: string; month: string; amount: number; notes?: string | null }) {
  const channel = String(input.channel || "").trim();
  const month = String(input.month || "").trim();
  if (!channel) throw new Error("Укажите канал");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Месяц должен быть YYYY-MM");
  const amount = Math.max(0, money(input.amount)); const now = Date.now();
  const existing = sqlite.prepare("SELECT id FROM channel_spend WHERE channel=? AND month=? ORDER BY updated_at DESC LIMIT 1").get(channel, month) as { id: string } | undefined;
  if (existing) sqlite.prepare("UPDATE channel_spend SET amount=?,notes=?,updated_at=? WHERE id=?").run(amount, input.notes || null, now, existing.id);
  else sqlite.prepare("INSERT INTO channel_spend(id,channel,month,amount,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
    .run(crypto.randomUUID(), channel, month, amount, input.notes || null, now, now);
  return { channel, month, amount };
}

export function getAssistantState() {
  const latestRun = sqlite.prepare("SELECT * FROM assistant_runs ORDER BY run_at DESC LIMIT 1").get() as Record<string, unknown> | undefined;
  const insights = sqlite.prepare(`SELECT id,fingerprint,severity,category,title,detail,entity_type AS entityType,entity_id AS entityId,
      action_url AS actionUrl,status,created_at AS createdAt,updated_at AS updatedAt
    FROM assistant_insights WHERE status='open' ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, updated_at DESC`).all() as Array<Record<string, unknown>>;
  return { latestRun: latestRun ? { ...latestRun, summary: JSON.parse(String(latestRun.summary_json || "{}")) } : null, insights, channels: channelMetrics(), month: moscowParts().month };
}

export async function runAssistantAudit(options: { notify?: boolean } = {}) {
  const now = Date.now();
  const cleanedDuplicates = cleanupSafeDuplicates();
  const cleanedActivityDuplicates = cleanupExactActivityDuplicates();
  const insights: AssistantInsightInput[] = [];
  analyzeMessagesAndClients(insights);
  analyzeProjectsAndFinance(insights);
  analyzeCrmQuality(insights);
  const channels = channelMetrics();
  analyzeChannels(insights, channels);

  const fingerprints = [...new Set(insights.map(x => x.fingerprint))];
  sqlite.transaction(() => {
    for (const item of insights) upsertInsight(item, now);
    if (fingerprints.length) {
      const placeholders = fingerprints.map(() => "?").join(",");
      sqlite.prepare(`UPDATE assistant_insights SET status='resolved',updated_at=? WHERE status='open' AND fingerprint NOT IN (${placeholders})`).run(now, ...fingerprints);
    } else sqlite.prepare("UPDATE assistant_insights SET status='resolved',updated_at=? WHERE status='open'").run(now);
  })();

  const critical = insights.filter(x => x.severity === "critical").length;
  const warning = insights.filter(x => x.severity === "warning").length;
  const summary = { critical, warning, cleanedDuplicates, cleanedActivityDuplicates, channels: channels.length };
  sqlite.prepare(`INSERT INTO assistant_runs(id,run_at,cleaned_duplicates,cleaned_activity_duplicates,critical_count,warning_count,summary_json)
    VALUES(?,?,?,?,?,?,?)`).run(crypto.randomUUID(), now, cleanedDuplicates, cleanedActivityDuplicates, critical, warning, JSON.stringify(summary));

  if (options.notify && (critical || cleanedDuplicates || cleanedActivityDuplicates)) {
    const top = insights.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).slice(0, 6);
    const text = [
      "🧭 <b>SATORI CRM · помощник</b>",
      `Критично: <b>${critical}</b> · требует внимания: <b>${warning}</b>`,
      cleanedDuplicates || cleanedActivityDuplicates ? `CRM очищена: клиентов-дублей ${cleanedDuplicates}, событий-дублей ${cleanedActivityDuplicates}` : null,
      ...top.map(x => `${x.severity === "critical" ? "🔴" : "🟠"} ${x.title}`),
    ].filter(Boolean).join("\n");
    const hash = createHash("sha256").update(text).digest("hex");
    const prev = sqlite.prepare("SELECT value FROM crm_settings WHERE key='satori_assistant_last_alert_hash'").get() as { value: string } | undefined;
    if (prev?.value !== hash) {
      await sendTelegramMessage({ text, url: "https://crm.satorilabural.online/assistant" }).catch(() => null);
      sqlite.prepare(`INSERT INTO crm_settings(key,value) VALUES('satori_assistant_last_alert_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(hash);
    }
  }
  return getAssistantState();
}
