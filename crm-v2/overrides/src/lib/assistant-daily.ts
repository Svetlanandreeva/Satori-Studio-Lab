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

function tableExists(name: string): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function epochMs(value: unknown): number {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw < 10_000_000_000 ? raw * 1000 : raw;
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

function countWindow(table: string, column: string, from: number, to: number, where = "1=1"): number {
  if (!tableExists(table)) return 0;
  const rows = sqlite.prepare(`SELECT ${column} AS value FROM ${table} WHERE ${where}`).all() as Array<{ value: unknown }>;
  return rows.filter((row) => {
    const time = epochMs(row.value);
    return time >= from && time < to;
  }).length;
}

function delta(current: number, previous: number): number {
  return current - previous;
}

function money(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export interface DailyManagementBrief {
  generatedAt: number;
  periodLabel: string;
  leads: { current: number; previous: number; delta: number };
  deals: { current: number; previous: number; delta: number };
  won: { current: number; previous: number; delta: number };
  messages: { incoming24h: number; unanswered: number };
  projects: { activeProduction: number; overdue: number; dueSoon: number; due7: number; due14: number };
  finance: { monthReceived: number; monthDealCosts: number; monthBusinessExpenses: number; monthNet: number; margin: number };
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
  const leadsCurrent = countWindow("contacts", "created_at", currentFrom, now, "COALESCE(qualification,'new') NOT IN ('spam','ignore')");
  const leadsPrevious = countWindow("contacts", "created_at", previousFrom, currentFrom, "COALESCE(qualification,'new') NOT IN ('spam','ignore')");
  const dealsCurrent = countWindow("deals", "created_at", currentFrom, now);
  const dealsPrevious = countWindow("deals", "created_at", previousFrom, currentFrom);

  let wonCurrent = 0;
  let wonPrevious = 0;
  if (tableExists("deals") && tableExists("pipeline_stages")) {
    const wonRows = sqlite.prepare(`
      SELECT d.updated_at AS updatedAt
      FROM deals d JOIN pipeline_stages ps ON ps.id=d.stage_id
      WHERE COALESCE(ps.is_won,0)=1
    `).all() as Array<{ updatedAt: unknown }>;
    for (const row of wonRows) {
      const time = epochMs(row.updatedAt);
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
      monthReceived += money(row.received);
      monthDealCosts += money(row.costs);
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
  if (tableExists("contacts")) {
    const rows = sqlite.prepare("SELECT source, created_at AS createdAt FROM contacts WHERE COALESCE(qualification,'new') NOT IN ('spam','ignore')").all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      const source = String(row.source || "other");
      const item = channelsMap.get(source) || { current: 0, previous: 0 };
      const time = epochMs(row.createdAt);
      if (time >= currentFrom && time < now) item.current++;
      else if (time >= previousFrom && time < currentFrom) item.previous++;
      channelsMap.set(source, item);
    }
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
    finance: { monthReceived, monthDealCosts, monthBusinessExpenses, monthNet, margin },
    pipeline: { activeValue, weightedValue },
    channels,
    crm: { openErrors, enrichedProfiles },
    topActions,
  };
}
