import { sqlite } from "@/db";

/**
 * Сроки производства по сделке.
 *
 * Дата оплаты = старт работ. Дедлайн = дата оплаты + срок в календарных днях.
 * Хранится в той же таблице project_details, что читают «Проекты» и «Производство»
 * (ordered_at = дата оплаты/старта, production_term_days, contract_deadline),
 * поэтому все экраны видят одни и те же даты.
 */

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS project_details (
    deal_id TEXT PRIMARY KEY REFERENCES deals(id) ON DELETE CASCADE,
    ordered_at TEXT,
    contract_deadline TEXT,
    shipped_at TEXT,
    delivered_at TEXT,
    production_term_days INTEGER,
    payment_terms TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

export type DeadlineStatus = "no_start" | "no_deadline" | "on_track" | "due_soon" | "due_today" | "overdue" | "shipped" | "shipped_late";

export interface DealSchedule {
  paidAt: string | null;
  termDays: number | null;
  deadline: string | null;
  shippedAt: string | null;
  status: DeadlineStatus;
  daysLeft: number | null;
  overdueDays: number;
  daysInWork: number | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function todayYekaterinburg(now: Date = new Date()): string {
  // Студия работает по Екатеринбургу — «сегодня» считаем по местному времени.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yekaterinburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function describeSchedule(paidAt: string | null, termDays: number | null, storedDeadline: string | null, shippedAt: string | null, today = todayYekaterinburg()): DealSchedule {
  const deadline = paidAt && termDays ? addDays(paidAt, termDays) : storedDeadline;
  const daysInWork = paidAt ? Math.max(0, daysBetween(paidAt, shippedAt || today)) : null;
  const base = { paidAt, termDays, deadline, shippedAt, daysInWork };
  if (!deadline) return { ...base, status: paidAt ? "no_deadline" : "no_start", daysLeft: null, overdueDays: 0 };
  if (shippedAt) {
    const late = daysBetween(deadline, shippedAt);
    return { ...base, status: late > 0 ? "shipped_late" : "shipped", daysLeft: null, overdueDays: Math.max(0, late) };
  }
  const left = daysBetween(today, deadline);
  if (left < 0) return { ...base, status: "overdue", daysLeft: left, overdueDays: -left };
  if (left === 0) return { ...base, status: "due_today", daysLeft: 0, overdueDays: 0 };
  if (left <= 2) return { ...base, status: "due_soon", daysLeft: left, overdueDays: 0 };
  return { ...base, status: "on_track", daysLeft: left, overdueDays: 0 };
}

type Row = { orderedAt: string | null; termDays: number | null; deadline: string | null; shippedAt: string | null };

function readRow(dealId: string): Row | undefined {
  return sqlite.prepare(`SELECT ordered_at AS orderedAt, production_term_days AS termDays, contract_deadline AS deadline, shipped_at AS shippedAt
    FROM project_details WHERE deal_id=?`).get(dealId) as Row | undefined;
}

export function getDealSchedule(dealId: string): DealSchedule {
  const row = readRow(dealId);
  return describeSchedule(row?.orderedAt || null, row?.termDays ? Number(row.termDays) : null, row?.deadline || null, row?.shippedAt || null);
}

export function getDealSchedules(dealIds: string[]): Map<string, DealSchedule> {
  const out = new Map<string, DealSchedule>();
  if (!dealIds.length) return out;
  const today = todayYekaterinburg();
  const rows = sqlite.prepare(`SELECT deal_id AS dealId, ordered_at AS orderedAt, production_term_days AS termDays, contract_deadline AS deadline, shipped_at AS shippedAt
    FROM project_details`).all() as Array<Row & { dealId: string }>;
  const wanted = new Set(dealIds);
  for (const r of rows) {
    if (!wanted.has(r.dealId)) continue;
    out.set(r.dealId, describeSchedule(r.orderedAt || null, r.termDays ? Number(r.termDays) : null, r.deadline || null, r.shippedAt || null, today));
  }
  return out;
}

/** Сохраняет дату оплаты и срок; дедлайн пересчитывается автоматически. */
export function saveDealSchedule(dealId: string, input: { paidAt?: unknown; termDays?: unknown }) {
  const paidAt = input.paidAt === undefined ? undefined : (String(input.paidAt || "").trim() || null);
  if (paidAt && !ISO.test(paidAt)) throw new Error("Дата оплаты должна быть в формате ГГГГ-ММ-ДД");
  let termDays: number | null | undefined = undefined;
  if (input.termDays !== undefined) {
    if (input.termDays === null || input.termDays === "") termDays = null;
    else {
      termDays = Math.round(Number(input.termDays));
      if (!Number.isFinite(termDays) || termDays < 1 || termDays > 365) throw new Error("Срок — от 1 до 365 дней");
    }
  }
  const current = readRow(dealId);
  const nextPaid = paidAt === undefined ? current?.orderedAt ?? null : paidAt;
  const nextTerm = termDays === undefined ? (current?.termDays ? Number(current.termDays) : null) : termDays;
  const deadline = nextPaid && nextTerm ? addDays(nextPaid, nextTerm) : (nextTerm ? null : (current?.deadline ?? null));
  const now = Date.now();
  sqlite.prepare(`
    INSERT INTO project_details (deal_id, ordered_at, contract_deadline, shipped_at, delivered_at, production_term_days, payment_terms, notes, created_at, updated_at)
    VALUES (?, ?, ?, NULL, NULL, ?, NULL, NULL, ?, ?)
    ON CONFLICT(deal_id) DO UPDATE SET
      ordered_at = excluded.ordered_at,
      production_term_days = excluded.production_term_days,
      contract_deadline = excluded.contract_deadline,
      updated_at = excluded.updated_at
  `).run(dealId, nextPaid, deadline, nextTerm, now, now);
  return getDealSchedule(dealId);
}
