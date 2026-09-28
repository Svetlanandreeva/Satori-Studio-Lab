import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { syncCalculationMilestones } from "@/lib/deal-flow";
import { calculateDealFinancials } from "@/lib/deal-financials";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(DB_PATH, { timeout: 15000 });
try { sqlite.pragma("journal_mode = WAL"); } catch {}
try { sqlite.pragma("busy_timeout = 15000"); } catch {}
try { sqlite.pragma("foreign_keys = ON"); } catch {}

const STORE_PRODUCTION_TERM_DAYS = 7;

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

function tableColumns(table: string): Set<string> {
  return new Set(
    (sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name)
  );
}

const projectColumns = tableColumns("project_details");
if (!projectColumns.has("production_term_days")) {
  sqlite.exec("ALTER TABLE project_details ADD COLUMN production_term_days INTEGER");
}
if (!projectColumns.has("payment_terms")) {
  sqlite.exec("ALTER TABLE project_details ADD COLUMN payment_terms TEXT");
}
if (!projectColumns.has("delivered_at")) {
  sqlite.exec("ALTER TABLE project_details ADD COLUMN delivered_at TEXT");
}

export interface ProjectDetailsInput {
  dealId: string;
  orderedAt?: string | null;
  productionTermDays?: number | null;
  contractDeadline?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
}

function optionalDate(value: unknown): string | null {
  const result = String(value || "").trim();
  if (!result) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error("Дата должна быть в формате YYYY-MM-DD");
  const parsed = new Date(`${result}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error("Некорректная дата");
  return result;
}

function productionTerm(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const days = Math.round(Number(value));
  if (!Number.isFinite(days) || days <= 0 || days > 3650) {
    throw new Error("Срок производства должен быть от 1 до 3650 дней");
  }
  return days;
}

function moscowDate(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function dateOnlyFromTimestamp(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return moscowDate(parsed);
}

function addCalendarDays(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

function storeOrderIdFromNotes(notes: unknown): string | null {
  const text = String(notes || "");
  const patterns = [
    /\[store-order:([^\]]+)\]/i,
    /\[legacy-deal:(?:web|order):([^\]]+)\]/i,
    /^Source ID:\s*([^\s]+)\s*$/im,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function deadlineMetrics(deadline: string | null, shippedAt: string | null) {
  if (!deadline) return { deadlineStatus: "no_deadline", daysRemaining: null, overdueDays: 0 };
  if (shippedAt) {
    const delta = daysBetween(deadline, shippedAt);
    return {
      deadlineStatus: delta > 0 ? "shipped_late" : "shipped",
      daysRemaining: 0,
      overdueDays: Math.max(0, delta),
    };
  }
  const delta = daysBetween(moscowDate(), deadline);
  if (delta < 0) return { deadlineStatus: "overdue", daysRemaining: 0, overdueDays: Math.abs(delta) };
  if (delta === 0) return { deadlineStatus: "due_today", daysRemaining: 0, overdueDays: 0 };
  if (delta <= 2) return { deadlineStatus: "due_soon", daysRemaining: delta, overdueDays: 0 };
  return { deadlineStatus: "on_track", daysRemaining: delta, overdueDays: 0 };
}

export function seedStoreOrderPaymentDate(dealId: string, paymentTimestamp: unknown) {
  const paidAt = dateOnlyFromTimestamp(paymentTimestamp);
  if (!paidAt) return null;
  const now = Date.now();
  const existing = sqlite.prepare(`
    SELECT ordered_at AS orderedAt
    FROM project_details WHERE deal_id = ?
  `).get(dealId) as { orderedAt: string | null } | undefined;

  const orderedAt = existing?.orderedAt || paidAt;
  const deadline = addCalendarDays(orderedAt, STORE_PRODUCTION_TERM_DAYS);

  if (!existing) {
    sqlite.prepare(`
      INSERT INTO project_details (
        deal_id, ordered_at, contract_deadline, shipped_at, delivered_at,
        production_term_days, payment_terms, notes, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, NULL, ?, NULL, NULL, ?, ?)
    `).run(dealId, orderedAt, deadline, STORE_PRODUCTION_TERM_DAYS, now, now);
    return orderedAt;
  }

  sqlite.prepare(`
    UPDATE project_details
    SET ordered_at = ?, production_term_days = ?, contract_deadline = ?, updated_at = ?
    WHERE deal_id = ?
  `).run(orderedAt, STORE_PRODUCTION_TERM_DAYS, deadline, now, dealId);
  return orderedAt;
}

export function markStoreOrderShipped(dealId: string, shippedTimestamp: unknown = new Date()) {
  const shippedAt = dateOnlyFromTimestamp(shippedTimestamp) || moscowDate();
  const now = Date.now();
  sqlite.prepare(`
    INSERT INTO project_details (
      deal_id, ordered_at, contract_deadline, shipped_at, delivered_at,
      production_term_days, payment_terms, notes, created_at, updated_at
    ) VALUES (?, NULL, NULL, ?, NULL, ?, NULL, NULL, ?, ?)
    ON CONFLICT(deal_id) DO UPDATE SET
      shipped_at = COALESCE(project_details.shipped_at, excluded.shipped_at),
      production_term_days = COALESCE(project_details.production_term_days, excluded.production_term_days),
      updated_at = excluded.updated_at
  `).run(dealId, shippedAt, STORE_PRODUCTION_TERM_DAYS, now, now);
  return shippedAt;
}

export function markStoreOrderDelivered(dealId: string, deliveredTimestamp: unknown = new Date()) {
  const deliveredAt = dateOnlyFromTimestamp(deliveredTimestamp) || moscowDate();
  const now = Date.now();
  sqlite.prepare(`
    INSERT INTO project_details (
      deal_id, ordered_at, contract_deadline, shipped_at, delivered_at,
      production_term_days, payment_terms, notes, created_at, updated_at
    ) VALUES (?, NULL, NULL, NULL, ?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(deal_id) DO UPDATE SET
      delivered_at = COALESCE(project_details.delivered_at, excluded.delivered_at),
      production_term_days = COALESCE(project_details.production_term_days, excluded.production_term_days),
      updated_at = excluded.updated_at
  `).run(dealId, deliveredAt, STORE_PRODUCTION_TERM_DAYS, now, now);
  return deliveredAt;
}

export function saveProjectDetails(input: ProjectDetailsInput) {
  syncCalculationMilestones();
  const deal = sqlite.prepare(`
    SELECT d.id, d.notes,
      pd.ordered_at AS existingOrderedAt,
      pd.shipped_at AS existingShippedAt,
      pd.delivered_at AS existingDeliveredAt
    FROM deals d
    JOIN deal_flow_state f ON f.deal_id = d.id AND f.calculation_entered_at IS NOT NULL
    LEFT JOIN project_details pd ON pd.deal_id = d.id
    WHERE d.id = ?
  `).get(input.dealId) as {
    id: string;
    notes: string | null;
    existingOrderedAt: string | null;
    existingShippedAt: string | null;
    existingDeliveredAt: string | null;
  } | undefined;
  if (!deal) throw new Error("Проект появится после этапа «Расчёт»");

  const isStoreOrder = Boolean(storeOrderIdFromNotes(deal.notes));
  const inputOrderedAt = optionalDate(input.orderedAt);
  const orderedAt = isStoreOrder ? (deal.existingOrderedAt || inputOrderedAt) : inputOrderedAt;
  const termDays = isStoreOrder ? STORE_PRODUCTION_TERM_DAYS : productionTerm(input.productionTermDays);
  if (termDays && !orderedAt) throw new Error("Для расчёта дедлайна укажите дату оплаты/старта");
  const manualDeadline = optionalDate(input.contractDeadline);
  const contractDeadline = orderedAt && termDays ? addCalendarDays(orderedAt, termDays) : manualDeadline;
  const now = Date.now();
  const values = {
    dealId: input.dealId,
    orderedAt,
    productionTermDays: termDays,
    contractDeadline,
    shippedAt: optionalDate(input.shippedAt) || (isStoreOrder ? deal.existingShippedAt : null),
    deliveredAt: optionalDate(input.deliveredAt) || (isStoreOrder ? deal.existingDeliveredAt : null),
    paymentTerms: input.paymentTerms ? String(input.paymentTerms).trim() : null,
    notes: input.notes ? String(input.notes).trim() : null,
    createdAt: now,
    updatedAt: now,
  };

  sqlite.prepare(`
    INSERT INTO project_details (
      deal_id, ordered_at, contract_deadline, shipped_at, delivered_at,
      production_term_days, payment_terms, notes, created_at, updated_at
    ) VALUES (
      @dealId, @orderedAt, @contractDeadline, @shippedAt, @deliveredAt,
      @productionTermDays, @paymentTerms, @notes, @createdAt, @updatedAt
    )
    ON CONFLICT(deal_id) DO UPDATE SET
      ordered_at = excluded.ordered_at,
      contract_deadline = excluded.contract_deadline,
      shipped_at = excluded.shipped_at,
      delivered_at = excluded.delivered_at,
      production_term_days = excluded.production_term_days,
      payment_terms = excluded.payment_terms,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(values);

  return listProjects().find((project) => project.dealId === input.dealId) || null;
}

export function listProjects() {
  syncCalculationMilestones();
  const rows = sqlite.prepare(`
    SELECT
      d.id AS dealId, d.title AS title, d.value AS dealValue, d.notes AS dealNotes,
      d.created_at AS dealCreatedAt, d.updated_at AS dealUpdatedAt,
      c.id AS contactId, c.name AS contactName, c.company AS company,
      c.phone AS phone, c.email AS email, c.qualification AS qualification,
      ps.name AS stageName,
      flow.calculation_entered_at AS calculationEnteredAt,
      pd.ordered_at AS orderedAt,
      pd.contract_deadline AS contractDeadline,
      pd.shipped_at AS shippedAt,
      pd.delivered_at AS deliveredAt,
      pd.production_term_days AS productionTermDays,
      pd.payment_terms AS paymentTerms,
      pd.notes AS projectNotes,
      pd.updated_at AS projectUpdatedAt,
      COALESCE(e.received_amount, 0) AS receivedAmount,
      COALESCE(e.production_cost, 0) AS productionCost,
      COALESCE(e.payment_commission, 0) AS paymentCommission,
      COALESCE(e.delivery_cost, 0) AS deliveryCost,
      COALESCE(e.packaging_cost, 0) AS packagingCost,
      COALESCE(e.contractor_cost, 0) AS contractorCost,
      COALESCE(e.tax_cost, 0) AS taxCost,
      COALESCE(e.other_cost, 0) AS otherCost
    FROM deals d
    JOIN contacts c ON c.id = d.contact_id
    JOIN pipeline_stages ps ON ps.id = d.stage_id
    JOIN deal_flow_state flow ON flow.deal_id = d.id AND flow.calculation_entered_at IS NOT NULL
    LEFT JOIN project_details pd ON pd.deal_id = d.id
    LEFT JOIN deal_economics e ON e.deal_id = d.id
    WHERE COALESCE(c.qualification, 'new') NOT IN ('spam', 'ignore')
      AND ps.name <> 'Песочница / Спам'
      AND COALESCE(ps.is_lost, 0) = 0
    ORDER BY flow.calculation_entered_at DESC, d.created_at DESC
  `).all() as Array<Record<string, unknown>>;

  const projects = rows.map((row) => {
    const finance = calculateDealFinancials(row);
    const dealNotes = String(row.dealNotes || "");
    const isStoreOrder = Boolean(storeOrderIdFromNotes(dealNotes));
    const orderedAt = row.orderedAt ? String(row.orderedAt) : null;
    const productionTermDays = isStoreOrder
      ? STORE_PRODUCTION_TERM_DAYS
      : (row.productionTermDays ? Number(row.productionTermDays) : null);
    const storedDeadline = row.contractDeadline ? String(row.contractDeadline) : null;
    const contractDeadline = isStoreOrder && orderedAt
      ? addCalendarDays(orderedAt, STORE_PRODUCTION_TERM_DAYS)
      : storedDeadline;
    const shippedAt = row.shippedAt ? String(row.shippedAt) : null;
    const deliveredAt = row.deliveredAt ? String(row.deliveredAt) : null;
    const paymentTerms = row.paymentTerms ? String(row.paymentTerms) : null;
    const deadline = deadlineMetrics(contractDeadline, shippedAt);
    const elapsedProductionDays = orderedAt
      ? Math.max(0, daysBetween(orderedAt, shippedAt || moscowDate()))
      : null;
    const deliveryDays = shippedAt
      ? Math.max(0, daysBetween(shippedAt, deliveredAt || moscowDate()))
      : null;

    return {
      ...row,
      dealId: String(row.dealId || ""),
      isStoreOrder,
      orderedAt,
      contractDeadline,
      shippedAt,
      deliveredAt,
      paymentTerms,
      productionTermDays,
      ...finance,
      productionDays: elapsedProductionDays,
      deliveryDays,
      ...deadline,
    };
  });

  const priority: Record<string, number> = {
    overdue: 0, due_today: 1, due_soon: 2, on_track: 3,
    no_deadline: 4, shipped_late: 5, shipped: 6,
  };
  return projects.sort((a, b) => {
    const p = (priority[String(a.deadlineStatus)] ?? 9) - (priority[String(b.deadlineStatus)] ?? 9);
    if (p !== 0) return p;
    return String(a.contractDeadline || "9999-12-31").localeCompare(String(b.contractDeadline || "9999-12-31"));
  });
}
