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
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_business_expenses_month
    ON business_expenses(month);
`);

function tableColumns(table: string): Set<string> {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function ensureBusinessExpenseColumns() {
  const columns = tableColumns("business_expenses");
  const migrations: Array<[string, string]> = [
    ["expense_type", "TEXT NOT NULL DEFAULT 'fixed'"],
    ["percent_rate", "REAL NOT NULL DEFAULT 0"],
    ["percent_base_amount", "INTEGER NOT NULL DEFAULT 0"],
    ["due_date", "TEXT"],
    ["paid_at", "TEXT"],
  ];
  for (const [name, definition] of migrations) {
    if (!columns.has(name)) sqlite.exec(`ALTER TABLE business_expenses ADD COLUMN ${name} ${definition}`);
  }
}

ensureBusinessExpenseColumns();

export interface EconomicsInput {
  dealId: string;
  receivedAmount: number;
  productionCost: number;
  paymentCommission: number;
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
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Месяц должен быть в формате YYYY-MM");
  }
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
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
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

export function saveDealEconomics(input: EconomicsInput) {
  const deal = sqlite.prepare("SELECT id FROM deals WHERE id = ?").get(input.dealId) as { id: string } | undefined;
  if (!deal) throw new Error("Сделка не найдена");

  const values = {
    dealId: input.dealId,
    receivedAmount: money(input.receivedAmount),
    productionCost: money(input.productionCost),
    paymentCommission: money(input.paymentCommission),
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
      deal_id, received_amount, production_cost, payment_commission,
      delivery_cost, packaging_cost, contractor_cost, tax_cost,
      other_cost, notes, updated_at
    ) VALUES (
      @dealId, @receivedAmount, @productionCost, @paymentCommission,
      @deliveryCost, @packagingCost, @contractorCost, @taxCost,
      @otherCost, @notes, @updatedAt
    )
    ON CONFLICT(deal_id) DO UPDATE SET
      received_amount = excluded.received_amount,
      production_cost = excluded.production_cost,
      payment_commission = excluded.payment_commission,
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
    SELECT
      deal_id AS dealId,
      received_amount AS receivedAmount,
      production_cost AS productionCost,
      payment_commission AS paymentCommission,
      delivery_cost AS deliveryCost,
      packaging_cost AS packagingCost,
      contractor_cost AS contractorCost,
      tax_cost AS taxCost,
      other_cost AS otherCost,
      notes,
      updated_at AS updatedAt
    FROM deal_economics
    WHERE deal_id = ?
  `).get(dealId) || null;
}

export function listBusinessExpenses(month: string) {
  const normalizedMonth = validMonth(month);
  const rows = sqlite.prepare(`
    SELECT
      id,
      month,
      name,
      category,
      amount,
      expense_type AS expenseType,
      percent_rate AS percentRate,
      percent_base_amount AS percentBaseAmount,
      due_date AS dueDate,
      paid_at AS paidAt,
      notes,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM business_expenses
    WHERE month = ?
    ORDER BY COALESCE(due_date, '9999-12-31') ASC, amount DESC, created_at DESC
  `).all(normalizedMonth) as Array<{
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
    notes: string | null;
    createdAt: number;
    updatedAt: number;
  }>;

  const items = rows.map((row) => ({ ...row, ...paymentState(row.dueDate, row.paidAt) }));
  const total = items.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const paidTotal = items.filter((row) => row.paidAt).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const unpaidTotal = Math.max(0, total - paidTotal);
  return { month: normalizedMonth, items, total, paidTotal, unpaidTotal };
}

export function createBusinessExpense(input: BusinessExpenseInput) {
  const month = validMonth(input.month);
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Укажите название расхода");

  const expenseType = input.expenseType === "percent" ? "percent" : "fixed";
  const percentRate = expenseType === "percent" ? rate(input.percentRate) : 0;
  const percentBaseAmount = expenseType === "percent" ? money(input.percentBaseAmount) : 0;
  if (expenseType === "percent" && percentRate <= 0) throw new Error("Укажите налоговую ставку в процентах");
  if (expenseType === "percent" && percentBaseAmount <= 0) throw new Error("Укажите базу для расчёта процента");

  const amount = expenseType === "percent"
    ? Math.round((percentBaseAmount * percentRate) / 100)
    : money(input.amount);
  const now = Date.now();
  const row = {
    id: crypto.randomUUID(),
    month,
    name,
    category: String(input.category || "other").trim() || "other",
    amount,
    expenseType,
    percentRate,
    percentBaseAmount,
    dueDate: optionalDate(input.dueDate),
    paidAt: optionalDate(input.paidAt),
    notes: input.notes ? String(input.notes).trim() : null,
    createdAt: now,
    updatedAt: now,
  };
  sqlite.prepare(`
    INSERT INTO business_expenses (
      id, month, name, category, amount, expense_type, percent_rate,
      percent_base_amount, due_date, paid_at, notes, created_at, updated_at
    ) VALUES (
      @id, @month, @name, @category, @amount, @expenseType, @percentRate,
      @percentBaseAmount, @dueDate, @paidAt, @notes, @createdAt, @updatedAt
    )
  `).run(row);
  return { ...row, ...paymentState(row.dueDate, row.paidAt) };
}

export function setBusinessExpensePaidAt(id: string, paidAt: string | null) {
  const date = optionalDate(paidAt);
  const result = sqlite
    .prepare("UPDATE business_expenses SET paid_at = ?, updated_at = ? WHERE id = ?")
    .run(date, Date.now(), id);
  if (result.changes === 0) throw new Error("Расход не найден");
  return sqlite.prepare(`
    SELECT id, month, name, category, amount, expense_type AS expenseType,
      percent_rate AS percentRate, percent_base_amount AS percentBaseAmount,
      due_date AS dueDate, paid_at AS paidAt, notes,
      created_at AS createdAt, updated_at AS updatedAt
    FROM business_expenses WHERE id = ?
  `).get(id);
}

export function deleteBusinessExpense(id: string) {
  const result = sqlite.prepare("DELETE FROM business_expenses WHERE id = ?").run(id);
  return result.changes > 0;
}

export function listEconomics() {
  syncCalculationMilestones();

  const rows = sqlite.prepare(`
    SELECT
      d.id AS dealId,
      d.title AS dealTitle,
      d.value AS dealValue,
      d.contact_id AS contactId,
      c.name AS contactName,
      c.company AS company,
      ps.name AS stageName,
      COALESCE(e.received_amount, 0) AS receivedAmount,
      COALESCE(e.production_cost, 0) AS productionCost,
      COALESCE(e.payment_commission, 0) AS paymentCommission,
      COALESCE(e.delivery_cost, 0) AS deliveryCost,
      COALESCE(e.packaging_cost, 0) AS packagingCost,
      COALESCE(e.contractor_cost, 0) AS contractorCost,
      COALESCE(e.tax_cost, 0) AS taxCost,
      COALESCE(e.other_cost, 0) AS otherCost,
      e.notes AS economicsNotes,
      e.updated_at AS economicsUpdatedAt,
      flow.calculation_entered_at AS calculationEnteredAt
    FROM deals d
    JOIN contacts c ON c.id = d.contact_id
    JOIN pipeline_stages ps ON ps.id = d.stage_id
    JOIN deal_flow_state flow ON flow.deal_id = d.id AND flow.calculation_entered_at IS NOT NULL
    LEFT JOIN deal_economics e ON e.deal_id = d.id
    WHERE COALESCE(c.qualification, 'new') NOT IN ('spam', 'ignore')
      AND ps.name <> 'Песочница / Спам'
    ORDER BY flow.calculation_entered_at DESC, d.created_at DESC
  `).all() as EconomicsRow[];

  const normalized: CalculatedEconomicsRow[] = rows.map((row) => {
    const costs =
      Number(row.productionCost || 0) +
      Number(row.paymentCommission || 0) +
      Number(row.deliveryCost || 0) +
      Number(row.packagingCost || 0) +
      Number(row.contractorCost || 0) +
      Number(row.taxCost || 0) +
      Number(row.otherCost || 0);
    const received = Number(row.receivedAmount || 0);
    const profit = received - costs;
    const margin = received > 0 ? (profit / received) * 100 : 0;
    const unpaid = Math.max(0, Number(row.dealValue || 0) - received);
    return { ...row, totalCost: costs, profit, margin, unpaid };
  });

  const clients = new Map<string, {
    contactId: string;
    contactName: string;
    company: string | null;
    deals: number;
    receivedAmount: number;
    totalCost: number;
    profit: number;
  }>();

  for (const row of normalized) {
    const contactId = row.contactId;
    const current = clients.get(contactId) || {
      contactId,
      contactName: row.contactName || "Без имени",
      company: row.company,
      deals: 0,
      receivedAmount: 0,
      totalCost: 0,
      profit: 0,
    };
    current.deals += 1;
    current.receivedAmount += row.receivedAmount;
    current.totalCost += row.totalCost;
    current.profit += row.profit;
    clients.set(contactId, current);
  }

  const clientRows = Array.from(clients.values())
    .map((client) => ({
      ...client,
      margin: client.receivedAmount > 0 ? (client.profit / client.receivedAmount) * 100 : 0,
    }))
    .sort((a, b) => b.profit - a.profit);

  const totals = normalized.reduce(
    (acc, row) => {
      acc.dealValue += row.dealValue;
      acc.receivedAmount += row.receivedAmount;
      acc.totalCost += row.totalCost;
      acc.profit += row.profit;
      return acc;
    },
    { dealValue: 0, receivedAmount: 0, totalCost: 0, profit: 0 }
  );

  return {
    deals: normalized,
    clients: clientRows,
    totals: {
      ...totals,
      margin: totals.receivedAmount > 0 ? (totals.profit / totals.receivedAmount) * 100 : 0,
    },
  };
}
