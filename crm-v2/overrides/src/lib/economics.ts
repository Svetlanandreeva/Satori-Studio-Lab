import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { syncCalculationMilestones } from "@/lib/deal-flow";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(DB_PATH, { timeout: 15000 });
try { sqlite.pragma("journal_mode = WAL"); } catch {}
try { sqlite.pragma("busy_timeout = 15000"); } catch {}
try { sqlite.pragma("foreign_keys = ON"); } catch {}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS deal_economics (
    deal_id TEXT PRIMARY KEY REFERENCES deals(id) ON DELETE CASCADE,
    received_amount INTEGER NOT NULL DEFAULT 0,
    production_cost INTEGER NOT NULL DEFAULT 0,
    payment_commission INTEGER NOT NULL DEFAULT 0,
    payment_commission_rate REAL NOT NULL DEFAULT 0,
    delivery_cost INTEGER NOT NULL DEFAULT 0,
    packaging_cost INTEGER NOT NULL DEFAULT 0,
    contractor_cost INTEGER NOT NULL DEFAULT 0,
    tax_cost INTEGER NOT NULL DEFAULT 0,
    other_cost INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS business_expenses (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    amount INTEGER NOT NULL DEFAULT 0,
    expense_type TEXT NOT NULL DEFAULT 'fixed',
    percent_rate REAL NOT NULL DEFAULT 0,
    percent_base_amount INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    paid_at TEXT,
    recurring_monthly INTEGER NOT NULL DEFAULT 1,
    recurring_series_id TEXT,
    base_month TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_business_expenses_month ON business_expenses(month);
  CREATE INDEX IF NOT EXISTS idx_business_expenses_series ON business_expenses(recurring_series_id, month);
`);

function tableColumns(table: string): Set<string> {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function tableExists(table: string): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function ensureColumns() {
  const dealColumns = tableColumns("deal_economics");
  if (!dealColumns.has("payment_commission_rate")) {
    sqlite.exec("ALTER TABLE deal_economics ADD COLUMN payment_commission_rate REAL NOT NULL DEFAULT 0");
  }

  const columns = tableColumns("business_expenses");
  const migrations: Array<[string, string]> = [
    ["expense_type", "TEXT NOT NULL DEFAULT 'fixed'"],
    ["percent_rate", "REAL NOT NULL DEFAULT 0"],
    ["percent_base_amount", "INTEGER NOT NULL DEFAULT 0"],
    ["due_date", "TEXT"],
    ["paid_at", "TEXT"],
    ["recurring_monthly", "INTEGER NOT NULL DEFAULT 1"],
    ["recurring_series_id", "TEXT"],
    ["base_month", "TEXT"],
  ];
  for (const [name, definition] of migrations) {
    if (!columns.has(name)) sqlite.exec(`ALTER TABLE business_expenses ADD COLUMN ${name} ${definition}`);
  }
  sqlite.prepare("UPDATE business_expenses SET recurring_series_id = id WHERE recurring_series_id IS NULL OR TRIM(recurring_series_id) = ''").run();
}

ensureColumns();

export interface EconomicsInput {
  dealId: string;
  receivedAmount: number;
  productionCost: number;
  paymentCommission?: number;
  paymentCommissionRate?: number;
  deliveryCost: number;
  packagingCost: number;
  contractorCost: number;
  taxCost: number;
  otherCost: number;
  notes?: string | null;
}

export interface BusinessExpenseInput {
  month: string;
  name: string;
  category?: string;
  amount: number;
  expenseType?: "fixed" | "percent";
  percentRate?: number;
  percentBaseAmount?: number;
  dueDate?: string | null;
  paidAt?: string | null;
  recurringMonthly?: boolean;
  notes?: string | null;
}

interface EconomicsRow {
  dealId: string;
  dealTitle: string;
  dealValue: number;
  contactId: string;
  contactName: string;
  company: string | null;
  stageName: string;
  receivedAmount: number;
  productionCost: number;
  paymentCommission: number;
  paymentCommissionRate: number;
  deliveryCost: number;
  packagingCost: number;
  contractorCost: number;
  taxCost: number;
  otherCost: number;
  economicsNotes: string | null;
  economicsUpdatedAt: number | null;
  calculationEnteredAt: number;
}

interface CalculatedEconomicsRow extends EconomicsRow {
  totalCost: number;
  profit: number;
  margin: number;
  unpaid: number;
}

function money(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number));
}

function rate(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number * 1000) / 1000));
}

function validMonth(value: unknown): string {
  const month = String(value || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Месяц должен быть в формате YYYY-MM");
  return month;
}

function optionalDate(value: unknown): string | null {
  const result = String(value || "").trim();
  if (!result) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error("Дата должна быть в формате YYYY-MM-DD");
  const parsed = new Date(`${result}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error("Некорректная дата");
  return result;
}

function moscowDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function paymentState(dueDate: string | null, paidAt: string | null) {
  if (paidAt) return { paymentStatus: "paid", daysToPayment: 0 };
  if (!dueDate) return { paymentStatus: "no_date", daysToPayment: null };
  const days = daysBetween(moscowDate(), dueDate);
  if (days < 0) return { paymentStatus: "overdue", daysToPayment: days };
  if (days === 0) return { paymentStatus: "due_today", daysToPayment: 0 };
  if (days <= 3) return { paymentStatus: "due_soon", daysToPayment: days };
  return { paymentStatus: "upcoming", daysToPayment: days };
}

function previousMonth(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, mon - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function shiftDateByMonths(dateString: string | null, months: number): string | null {
  if (!dateString) return null;
  const [year, month, day] = dateString.split("-").map(Number);
  if (!year || !month || !day) return null;
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const shifted = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay)));
  return shifted.toISOString().slice(0, 10);
}

function revenueForMonth(month: string): number {
  if (tableExists("project_details")) {
    const row = sqlite.prepare(`
      SELECT COALESCE(SUM(e.received_amount), 0) AS total
      FROM deal_economics e
      LEFT JOIN project_details p ON p.deal_id = e.deal_id
      LEFT JOIN deals d ON d.id = e.deal_id
      WHERE COALESCE(p.ordered_at, date(d.created_at / 1000, 'unixepoch')) LIKE ?
    `).get(`${month}-%`) as { total: number } | undefined;
    return money(row?.total || 0);
  }
  const row = sqlite.prepare(`
    SELECT COALESCE(SUM(e.received_amount), 0) AS total
    FROM deal_economics e JOIN deals d ON d.id = e.deal_id
    WHERE date(d.created_at / 1000, 'unixepoch') LIKE ?
  `).get(`${month}-%`) as { total: number } | undefined;
  return money(row?.total || 0);
}

export function taxBaseForPaymentMonth(month: string) {
  const normalizedMonth = validMonth(month);
  const baseMonth = previousMonth(normalizedMonth);
  return { baseMonth, amount: revenueForMonth(baseMonth) };
}

export function saveDealEconomics(input: EconomicsInput) {
  const deal = sqlite.prepare("SELECT id FROM deals WHERE id = ?").get(input.dealId) as { id: string } | undefined;
  if (!deal) throw new Error("Сделка не найдена");

  const existing = sqlite.prepare("SELECT payment_commission AS paymentCommission, payment_commission_rate AS paymentCommissionRate FROM deal_economics WHERE deal_id = ?")
    .get(input.dealId) as { paymentCommission: number; paymentCommissionRate: number } | undefined;
  const receivedAmount = money(input.receivedAmount);
  const hasRateInput = input.paymentCommissionRate !== undefined && input.paymentCommissionRate !== null;
  const paymentCommissionRate = hasRateInput ? rate(input.paymentCommissionRate) : rate(existing?.paymentCommissionRate || 0);
  const paymentCommission = paymentCommissionRate > 0
    ? Math.round((receivedAmount * paymentCommissionRate) / 100)
    : input.paymentCommission !== undefined ? money(input.paymentCommission) : money(existing?.paymentCommission || 0);

  const values = {
    dealId: input.dealId,
    receivedAmount,
    productionCost: money(input.productionCost),
    paymentCommission,
    paymentCommissionRate,
    deliveryCost: money(input.deliveryCost),
    packagingCost: money(input.packagingCost),
    contractorCost: money(input.contractorCost),
    taxCost: money(input.taxCost),
    otherCost: money(input.otherCost),
    notes: input.notes ? String(input.notes).trim() : null,
    updatedAt: Date.now(),
  };

  sqlite.prepare(`
    INSERT INTO deal_economics (
      deal_id, received_amount, production_cost, payment_commission, payment_commission_rate,
      delivery_cost, packaging_cost, contractor_cost, tax_cost, other_cost, notes, updated_at
    ) VALUES (
      @dealId, @receivedAmount, @productionCost, @paymentCommission, @paymentCommissionRate,
      @deliveryCost, @packagingCost, @contractorCost, @taxCost, @otherCost, @notes, @updatedAt
    )
    ON CONFLICT(deal_id) DO UPDATE SET
      received_amount = excluded.received_amount,
      production_cost = excluded.production_cost,
      payment_commission = excluded.payment_commission,
      payment_commission_rate = excluded.payment_commission_rate,
      delivery_cost = excluded.delivery_cost,
      packaging_cost = excluded.packaging_cost,
      contractor_cost = excluded.contractor_cost,
      tax_cost = excluded.tax_cost,
      other_cost = excluded.other_cost,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(values);
  return getDealEconomics(input.dealId);
}

export function getDealEconomics(dealId: string) {
  return sqlite.prepare(`
    SELECT deal_id AS dealId, received_amount AS receivedAmount, production_cost AS productionCost,
      payment_commission AS paymentCommission, payment_commission_rate AS paymentCommissionRate,
      delivery_cost AS deliveryCost, packaging_cost AS packagingCost, contractor_cost AS contractorCost,
      tax_cost AS taxCost, other_cost AS otherCost, notes, updated_at AS updatedAt
    FROM deal_economics WHERE deal_id = ?
  `).get(dealId) || null;
}

interface BusinessExpenseRow {
  id: string;
  month: string;
  name: string;
  category: string;
  amount: number;
  expenseType: string;
  percentRate: number;
  percentBaseAmount: number;
  dueDate: string | null;
  paidAt: string | null;
  recurringMonthly: number;
  recurringSeriesId: string | null;
  baseMonth: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

function ensureRecurringExpensesForMonth(month: string) {
  const target = validMonth(month);
  const prior = sqlite.prepare(`
    SELECT id, month, name, category, amount, expense_type AS expenseType,
      percent_rate AS percentRate, percent_base_amount AS percentBaseAmount,
      due_date AS dueDate, paid_at AS paidAt, recurring_monthly AS recurringMonthly,
      recurring_series_id AS recurringSeriesId, base_month AS baseMonth,
      notes, created_at AS createdAt, updated_at AS updatedAt
    FROM business_expenses
    WHERE recurring_monthly = 1 AND month < ?
    ORDER BY month DESC, created_at DESC
  `).all(target) as BusinessExpenseRow[];

  const seen = new Set<string>();
  const currentSeries = new Set((sqlite.prepare("SELECT recurring_series_id AS id FROM business_expenses WHERE month = ?").all(target) as Array<{ id: string | null }>).map((x) => x.id || ""));

  for (const source of prior) {
    const seriesId = source.recurringSeriesId || source.id;
    if (seen.has(seriesId) || currentSeries.has(seriesId)) continue;
    seen.add(seriesId);
    const delta = monthDiff(source.month, target);
    const isTax = source.category === "taxes" && source.expenseType === "percent";
    const baseMonth = isTax ? previousMonth(target) : source.baseMonth;
    const percentBaseAmount = isTax ? revenueForMonth(baseMonth || previousMonth(target)) : source.percentBaseAmount;
    const amount = source.expenseType === "percent"
      ? Math.round((percentBaseAmount * rate(source.percentRate)) / 100)
      : source.amount;
    const now = Date.now();
    sqlite.prepare(`
      INSERT INTO business_expenses (
        id, month, name, category, amount, expense_type, percent_rate, percent_base_amount,
        due_date, paid_at, recurring_monthly, recurring_series_id, base_month, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), target, source.name, source.category, amount, source.expenseType,
      source.percentRate, percentBaseAmount, shiftDateByMonths(source.dueDate, delta), seriesId,
      baseMonth, source.notes, now, now);
  }
}

export function listBusinessExpenses(month: string) {
  const normalizedMonth = validMonth(month);
  ensureRecurringExpensesForMonth(normalizedMonth);
  const rows = sqlite.prepare(`
    SELECT id, month, name, category, amount, expense_type AS expenseType,
      percent_rate AS percentRate, percent_base_amount AS percentBaseAmount,
      due_date AS dueDate, paid_at AS paidAt, recurring_monthly AS recurringMonthly,
      recurring_series_id AS recurringSeriesId, base_month AS baseMonth,
      notes, created_at AS createdAt, updated_at AS updatedAt
    FROM business_expenses WHERE month = ?
    ORDER BY COALESCE(due_date, '9999-12-31') ASC, amount DESC, created_at DESC
  `).all(normalizedMonth) as BusinessExpenseRow[];

  const items = rows.map((row) => ({
    ...row,
    recurringMonthly: Boolean(row.recurringMonthly),
    ...paymentState(row.dueDate, row.paidAt),
  }));
  const total = items.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const paidTotal = items.filter((row) => row.paidAt).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return { month: normalizedMonth, items, total, paidTotal, unpaidTotal: Math.max(0, total - paidTotal), taxBase: taxBaseForPaymentMonth(normalizedMonth) };
}

export function createBusinessExpense(input: BusinessExpenseInput) {
  const month = validMonth(input.month);
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Укажите название расхода");
  const category = String(input.category || "other").trim() || "other";
  const expenseType = input.expenseType === "percent" ? "percent" : "fixed";
  const percentRate = expenseType === "percent" ? rate(input.percentRate) : 0;
  if (expenseType === "percent" && percentRate <= 0) throw new Error("Укажите ставку в процентах");

  const tax = category === "taxes" && expenseType === "percent";
  const baseMonth = tax ? previousMonth(month) : null;
  const percentBaseAmount = expenseType === "percent"
    ? tax ? revenueForMonth(baseMonth!) : money(input.percentBaseAmount)
    : 0;
  if (expenseType === "percent" && !tax && percentBaseAmount <= 0) throw new Error("Укажите базу для расчёта процента");

  const amount = expenseType === "percent" ? Math.round((percentBaseAmount * percentRate) / 100) : money(input.amount);
  const now = Date.now();
  const id = crypto.randomUUID();
  const recurringMonthly = input.recurringMonthly !== false;
  const row = {
    id, month, name, category, amount, expenseType, percentRate, percentBaseAmount,
    dueDate: optionalDate(input.dueDate), paidAt: optionalDate(input.paidAt),
    recurringMonthly: recurringMonthly ? 1 : 0, recurringSeriesId: id, baseMonth,
    notes: input.notes ? String(input.notes).trim() : null, createdAt: now, updatedAt: now,
  };
  sqlite.prepare(`
    INSERT INTO business_expenses (
      id, month, name, category, amount, expense_type, percent_rate, percent_base_amount,
      due_date, paid_at, recurring_monthly, recurring_series_id, base_month, notes, created_at, updated_at
    ) VALUES (
      @id, @month, @name, @category, @amount, @expenseType, @percentRate, @percentBaseAmount,
      @dueDate, @paidAt, @recurringMonthly, @recurringSeriesId, @baseMonth, @notes, @createdAt, @updatedAt
    )
  `).run(row);
  return { ...row, recurringMonthly, ...paymentState(row.dueDate, row.paidAt) };
}

export function setBusinessExpensePaidAt(id: string, paidAt: string | null) {
  const date = optionalDate(paidAt);
  const result = sqlite.prepare("UPDATE business_expenses SET paid_at = ?, updated_at = ? WHERE id = ?").run(date, Date.now(), id);
  if (result.changes === 0) throw new Error("Расход не найден");
  return sqlite.prepare(`
    SELECT id, month, name, category, amount, expense_type AS expenseType,
      percent_rate AS percentRate, percent_base_amount AS percentBaseAmount,
      due_date AS dueDate, paid_at AS paidAt, recurring_monthly AS recurringMonthly,
      recurring_series_id AS recurringSeriesId, base_month AS baseMonth, notes,
      created_at AS createdAt, updated_at AS updatedAt
    FROM business_expenses WHERE id = ?
  `).get(id);
}

export function deleteBusinessExpense(id: string) {
  const row = sqlite.prepare("SELECT id, month, recurring_monthly AS recurringMonthly, recurring_series_id AS seriesId FROM business_expenses WHERE id = ?")
    .get(id) as { id: string; month: string; recurringMonthly: number; seriesId: string | null } | undefined;
  if (!row) return false;
  if (!row.recurringMonthly || !row.seriesId) {
    return sqlite.prepare("DELETE FROM business_expenses WHERE id = ?").run(id).changes > 0;
  }
  const tx = sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM business_expenses WHERE recurring_series_id = ? AND month >= ?").run(row.seriesId, row.month);
    const prior = sqlite.prepare("SELECT id FROM business_expenses WHERE recurring_series_id = ? AND month < ? ORDER BY month DESC LIMIT 1").get(row.seriesId, row.month) as { id: string } | undefined;
    if (prior) sqlite.prepare("UPDATE business_expenses SET recurring_monthly = 0, updated_at = ? WHERE id = ?").run(Date.now(), prior.id);
  });
  tx();
  return true;
}

export function listEconomics() {
  syncCalculationMilestones();
  const rows = sqlite.prepare(`
    SELECT d.id AS dealId, d.title AS dealTitle, d.value AS dealValue, d.contact_id AS contactId,
      c.name AS contactName, c.company AS company, ps.name AS stageName,
      COALESCE(e.received_amount, 0) AS receivedAmount,
      COALESCE(e.production_cost, 0) AS productionCost,
      COALESCE(e.payment_commission, 0) AS paymentCommission,
      COALESCE(e.payment_commission_rate, 0) AS paymentCommissionRate,
      COALESCE(e.delivery_cost, 0) AS deliveryCost,
      COALESCE(e.packaging_cost, 0) AS packagingCost,
      COALESCE(e.contractor_cost, 0) AS contractorCost,
      COALESCE(e.tax_cost, 0) AS taxCost,
      COALESCE(e.other_cost, 0) AS otherCost,
      e.notes AS economicsNotes, e.updated_at AS economicsUpdatedAt,
      flow.calculation_entered_at AS calculationEnteredAt
    FROM deals d
    JOIN contacts c ON c.id = d.contact_id
    JOIN pipeline_stages ps ON ps.id = d.stage_id
    JOIN deal_flow_state flow ON flow.deal_id = d.id AND flow.calculation_entered_at IS NOT NULL
    LEFT JOIN deal_economics e ON e.deal_id = d.id
    WHERE COALESCE(c.qualification, 'new') NOT IN ('spam', 'ignore') AND ps.name <> 'Песочница / Спам'
    ORDER BY flow.calculation_entered_at DESC, d.created_at DESC
  `).all() as EconomicsRow[];

  const normalized: CalculatedEconomicsRow[] = rows.map((row) => {
    const inferredRate = Number(row.paymentCommissionRate || 0) || (row.receivedAmount > 0 && row.paymentCommission > 0 ? (row.paymentCommission / row.receivedAmount) * 100 : 0);
    const costs = Number(row.productionCost || 0) + Number(row.paymentCommission || 0) + Number(row.deliveryCost || 0) +
      Number(row.packagingCost || 0) + Number(row.contractorCost || 0) + Number(row.taxCost || 0) + Number(row.otherCost || 0);
    const received = Number(row.receivedAmount || 0);
    const profit = received - costs;
    return { ...row, paymentCommissionRate: inferredRate, totalCost: costs, profit, margin: received > 0 ? (profit / received) * 100 : 0, unpaid: Math.max(0, Number(row.dealValue || 0) - received) };
  });

  const clients = new Map<string, { contactId: string; contactName: string; company: string | null; deals: number; receivedAmount: number; totalCost: number; profit: number }>();
  for (const row of normalized) {
    const current = clients.get(row.contactId) || { contactId: row.contactId, contactName: row.contactName || "Без имени", company: row.company, deals: 0, receivedAmount: 0, totalCost: 0, profit: 0 };
    current.deals += 1; current.receivedAmount += row.receivedAmount; current.totalCost += row.totalCost; current.profit += row.profit;
    clients.set(row.contactId, current);
  }
  const clientRows = Array.from(clients.values()).map((client) => ({ ...client, margin: client.receivedAmount > 0 ? (client.profit / client.receivedAmount) * 100 : 0 })).sort((a, b) => b.profit - a.profit);
  const totals = normalized.reduce((acc, row) => {
    acc.dealValue += row.dealValue; acc.receivedAmount += row.receivedAmount; acc.totalCost += row.totalCost; acc.profit += row.profit; return acc;
  }, { dealValue: 0, receivedAmount: 0, totalCost: 0, profit: 0 });

  return { deals: normalized, clients: clientRows, totals: { ...totals, margin: totals.receivedAmount > 0 ? (totals.profit / totals.receivedAmount) * 100 : 0 } };
}
