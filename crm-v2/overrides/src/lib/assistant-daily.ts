import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { listProjects } from "@/lib/projects";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const sqlite = new Database(DB_PATH, { timeout: 15000 });
try { sqlite.pragma("journal_mode = WAL"); } catch {}
try { sqlite.pragma("busy_timeout = 15000"); } catch {}

const MANAGER_COMMISSION_RATE = 50;

function tableExists(name: string): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function epochMs(value: unknown): number {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw < 10_000_000_000 ? raw * 1000 : raw;
}

function dateOnlyEpochMs(value: unknown): number {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 0;
  const parsed = Date.parse(`${raw}T12:00:00+03:00`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moscowDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((x) => x.type === "year")?.value || "1970";
  const month = parts.find((x) => x.type === "month")?.value || "01";
  const day = parts.find((x) => x.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function moscowMonth(): string {
  return moscowDate().slice(0, 7);
}

function delta(current: number, previous: number): number {
  return current - previous;
}

function money(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function managerCommission(received: number, directCosts: number): number {
  const profitBeforeManager = Math.max(0, received - directCosts);
  return Math.round((profitBeforeManager * MANAGER_COMMISSION_RATE) / 100);
}

function rejectedStage(stageName: unknown, isLost: unknown): boolean {
  if (Number(isLost || 0) === 1) return true;
  const name = String(stageName || "").trim().toLowerCase().replace(/ё/g, "е");
  return name.includes("отказ") || name.includes("спам") || name.includes("песочница");
}

interface DailyLeadRow {
  id: string;
  source: string | null;
  createdAt: unknown;
  totalDeals: number;
  liveDeals: number;
}

function dailyLeadRows(): DailyLeadRow[] {
  if (!tableExists("contacts")) return [];
  if (!tableExists("deals") || !tableExists("pipeline_stages")) {
    return sqlite.prepare(`
      SELECT id, source, created_at AS createdAt, 0 AS totalDeals, 0 AS liveDeals
      FROM contacts
      WHERE COALESCE(qualification,'new') NOT IN ('spam','ignore')
    `).all() as DailyLeadRow[];
  }

  const contacts = sqlite.prepare(`
    SELECT c.id, c.source, c.created_at AS createdAt,
      (SELECT COUNT(*) FROM deals d WHERE d.contact_id=c.id) AS totalDeals,
      (SELECT COUNT(*)
       FROM deals d JOIN pipeline_stages ps ON ps.id=d.stage_id
       WHERE d.contact_id=c.id
         AND COALESCE(ps.is_lost,0)=0
         AND lower(COALESCE(ps.name,'')) NOT LIKE '%отказ%'
         AND lower(COALESCE(ps.name,'')) NOT LIKE '%спам%'
         AND lower(COALESCE(ps.name,'')) NOT LIKE '%песочниц%') AS liveDeals
    FROM contacts c
    WHERE COALESCE(c.qualification,'new') NOT IN ('spam','ignore')
  `).all() as DailyLeadRow[];

  // Новый контакт без сделки — это лид. Если все его заявки уже переведены в
  // «Отказ»/спам, он больше не должен раздувать управленческую карточку «Новые лиды».
  return contacts.filter((row) => Number(row.totalDeals || 0) === 0 || Number(row.liveDeals || 0) > 0);
}

function dailyDealTimes(): number[] {
  if (!tableExists("deals")) return [];
  if (!tableExists("pipeline_stages")) {
    return (sqlite.prepare("SELECT created_at AS createdAt FROM deals").all() as Array<{ createdAt: unknown }>).map((x) => epochMs(x.createdAt)).filter(Boolean);
  }
  const rows = sqlite.prepare(`
    SELECT d.created_at AS createdAt, ps.name AS stageName, ps.is_lost AS isLost
    FROM deals d JOIN pipeline_stages ps ON ps.id=d.stage_id
  `).all() as Array<{ createdAt: unknown; stageName: unknown; isLost: unknown }>;
  return rows.filter((row) => !rejectedStage(row.stageName, row.isLost)).map((row) => epochMs(row.createdAt)).filter(Boolean);
}

export interface DailyManagementBrief {
  generatedAt: number;
  periodLabel: string;
  leads: { current: number; previous: number; delta: number };
  deals: { current: number; previous: number; delta: number };
  won: { current: number; previous: number; delta: number };
  messages: { incoming24h: number; unanswered: number };
  projects: { activeProduction: number; overdue: number; dueSoon: number; due7: number; due14: number };
  finance: { monthReceived: number; monthDealCosts: number; monthManagerCommission: number; monthBusinessExpenses: number; monthNet: number; margin: number };
  pipeline: { activeValue: number; weightedValue: number };
  channels: Array<{ source: string; leads24h: number; previous24h: number; delta: number }>;
  crm: { openErrors: number; enrichedProfiles: number };
  topActions: Array<{ severity: string; title: string; detail: string; actionUrl: string | null }>;
}

export function getDailyManagementBrief(): DailyManagementBrief {
  const now = Date.now();
  const day = 86_400_000;
  const currentFrom = now - day;
  const previousFrom = now - day * 2;

  const leadRows = dailyLeadRows();
  const leadTimes = leadRows.map((row) => ({ row, time: epochMs(row.createdAt) }));
  const leadsCurrent = leadTimes.filter(({ time }) => time >= currentFrom && time < now).length;
  const leadsPrevious = leadTimes.filter(({ time }) => time >= previousFrom && time < currentFrom).length;

  // «Новые сделки» — только реальные заявки, которые всё ещё существуют в рабочей
  // воронке. Переведённые в «Отказ» не считаются как сегодняшние новые сделки.
  const dealTimes = dailyDealTimes();
  const dealsCurrent = dealTimes.filter((time) => time >= currentFrom && time < now).length;
  const dealsPrevious = dealTimes.filter((time) => time >= previousFrom && time < currentFrom).length;

  // Продажа считается только по фактической дате оплаты/старта проекта и только
  // когда в экономике действительно есть поступление. Изменение этапа сделки или
  // редактирование карточки больше не создаёт ложную «продажу за 24 часа».
  let wonCurrent = 0;
  let wonPrevious = 0;
  if (tableExists("deal_economics") && tableExists("project_details")) {
    const paidRows = sqlite.prepare(`
      SELECT p.ordered_at AS paidAt, e.received_amount AS received
      FROM deal_economics e
      JOIN project_details p ON p.deal_id=e.deal_id
      WHERE COALESCE(e.received_amount,0) > 0 AND p.ordered_at IS NOT NULL
    `).all() as Array<{ paidAt: unknown; received: unknown }>;
    for (const row of paidRows) {
      const time = dateOnlyEpochMs(row.paidAt);
      if (!time) continue;
      if (time >= currentFrom && time < now) wonCurrent++;
      else if (time >= previousFrom && time < currentFrom) wonPrevious++;
    }
  }

  let incoming24h = 0;
  if (tableExists("email_messages")) {
    const rows = sqlite.prepare("SELECT received_at AS at FROM email_messages WHERE direction='incoming' AND COALESCE(is_service,0)=0").all() as Array<{ at: unknown }>;
    incoming24h += rows.filter((x) => epochMs(x.at) >= currentFrom).length;
  }
  if (tableExists("activities")) {
    const rows = sqlite.prepare("SELECT created_at AS at FROM activities WHERE lower(type) LIKE 'telegram%incoming%'").all() as Array<{ at: unknown }>;
    incoming24h += rows.filter((x) => epochMs(x.at) >= currentFrom).length;
  }

  const unanswered = tableExists("assistant_insights")
    ? Number((sqlite.prepare("SELECT COUNT(*) AS n FROM assistant_insights WHERE status='open' AND category='messages'").get() as { n?: number } | undefined)?.n || 0)
    : 0;

  const projects = listProjects() as Array<Record<string, unknown>>;
  const activeProduction = projects.filter((p) => !p.shippedAt && !p.deliveredAt).length;
  const overdue = projects.filter((p) => String(p.deadlineStatus || "") === "overdue").length;
  const dueSoon = projects.filter((p) => ["due_today", "due_soon"].includes(String(p.deadlineStatus || "")) && Number(p.daysRemaining) <= 2).length;
  const due7 = projects.filter((p) => !p.shippedAt && Number(p.daysRemaining) >= 0 && Number(p.daysRemaining) <= 7).length;
  const due14 = projects.filter((p) => !p.shippedAt && Number(p.daysRemaining) >= 0 && Number(p.daysRemaining) <= 14).length;

  const month = moscowMonth();
  let monthReceived = 0;
  let monthDealCosts = 0;
  let monthManagerCommission = 0;
  if (tableExists("deal_economics") && tableExists("deals")) {
    const hasProjects = tableExists("project_details");
    const rows = sqlite.prepare(hasProjects ? `
      SELECT e.received_amount AS received, e.production_cost + e.payment_commission + e.delivery_cost +
        e.packaging_cost + e.contractor_cost + e.tax_cost + e.other_cost AS costs,
        COALESCE(p.ordered_at, date(d.created_at / 1000, 'unixepoch')) AS eventDate
      FROM deal_economics e JOIN deals d ON d.id=e.deal_id LEFT JOIN project_details p ON p.deal_id=e.deal_id
    ` : `
      SELECT e.received_amount AS received, e.production_cost + e.payment_commission + e.delivery_cost +
        e.packaging_cost + e.contractor_cost + e.tax_cost + e.other_cost AS costs,
        date(d.created_at / 1000, 'unixepoch') AS eventDate
      FROM deal_economics e JOIN deals d ON d.id=e.deal_id
    `).all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      if (!String(row.eventDate || "").startsWith(month)) continue;
      const received = money(row.received);
      const directCosts = money(row.costs);
      const commission = managerCommission(received, directCosts);
      monthReceived += received;
      monthManagerCommission += commission;
      monthDealCosts += directCosts + commission;
    }
  }

  let monthBusinessExpenses = 0;
  if (tableExists("business_expenses")) {
    const row = sqlite.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM business_expenses WHERE month=?").get(month) as { total?: number } | undefined;
    monthBusinessExpenses = money(row?.total);
  }
  const monthNet = monthReceived - monthDealCosts - monthBusinessExpenses;
  const margin = monthReceived > 0 ? Math.round((monthNet / monthReceived) * 1000) / 10 : 0;

  let activeValue = 0;
  let weightedValue = 0;
  if (tableExists("deals") && tableExists("pipeline_stages")) {
    const rows = sqlite.prepare(`
      SELECT d.value, d.probability FROM deals d JOIN pipeline_stages ps ON ps.id=d.stage_id
      WHERE COALESCE(ps.is_won,0)=0 AND COALESCE(ps.is_lost,0)=0
    `).all() as Array<{ value: number; probability: number }>;
    for (const row of rows) {
      activeValue += money(row.value);
      weightedValue += Math.round(money(row.value) * Math.max(0, Math.min(100, Number(row.probability || 0))) / 100);
    }
  }

  const channelsMap = new Map<string, { current: number; previous: number }>();
  for (const { row, time } of leadTimes) {
    const source = String(row.source || "other");
    const item = channelsMap.get(source) || { current: 0, previous: 0 };
    if (time >= currentFrom && time < now) item.current++;
    else if (time >= previousFrom && time < currentFrom) item.previous++;
    channelsMap.set(source, item);
  }
  const channels = Array.from(channelsMap.entries())
    .map(([source, item]) => ({ source, leads24h: item.current, previous24h: item.previous, delta: item.current - item.previous }))
    .filter((x) => x.leads24h || x.previous24h)
    .sort((a, b) => b.leads24h - a.leads24h || b.delta - a.delta)
    .slice(0, 8);

  const openErrors = tableExists("assistant_insights")
    ? Number((sqlite.prepare("SELECT COUNT(*) AS n FROM assistant_insights WHERE status='open' AND category='crm'").get() as { n?: number } | undefined)?.n || 0)
    : 0;
  const enrichedProfiles = tableExists("contact_intelligence")
    ? Number((sqlite.prepare("SELECT COUNT(*) AS n FROM contact_intelligence").get() as { n?: number } | undefined)?.n || 0)
    : 0;

  const topActions = tableExists("assistant_insights")
    ? (sqlite.prepare(`
        SELECT severity,title,detail,action_url AS actionUrl FROM assistant_insights
        WHERE status='open' ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, updated_at DESC LIMIT 6
      `).all() as Array<{ severity: string; title: string; detail: string; actionUrl: string | null }>)
    : [];

  return {
    generatedAt: now,
    periodLabel: "последние 24 часа",
    leads: { current: leadsCurrent, previous: leadsPrevious, delta: delta(leadsCurrent, leadsPrevious) },
    deals: { current: dealsCurrent, previous: dealsPrevious, delta: delta(dealsCurrent, dealsPrevious) },
    won: { current: wonCurrent, previous: wonPrevious, delta: delta(wonCurrent, wonPrevious) },
    messages: { incoming24h, unanswered },
    projects: { activeProduction, overdue, dueSoon, due7, due14 },
    finance: { monthReceived, monthDealCosts, monthManagerCommission, monthBusinessExpenses, monthNet, margin },
    pipeline: { activeValue, weightedValue },
    channels,
    crm: { openErrors, enrichedProfiles },
    topActions,
  };
}
