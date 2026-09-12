import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { syncCalculationMilestones } from "@/lib/deal-flow";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(DB_PATH, { timeout: 15000 });
try { sqlite.pragma("journal_mode = WAL"); } catch {}
try { sqlite.pragma("busy_timeout = 15000"); } catch {}
try { sqlite.pragma("foreign_keys = ON"); } catch {}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS project_details (
    deal_id TEXT PRIMARY KEY REFERENCES deals(id) ON DELETE CASCADE,
    ordered_at TEXT,
    contract_deadline TEXT,
    shipped_at TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

export interface ProjectDetailsInput {
  dealId: string;
  orderedAt?: string | null;
  contractDeadline?: string | null;
  shippedAt?: string | null;
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

function deadlineMetrics(deadline: string | null, shippedAt: string | null) {
  if (!deadline) {
    return {
      deadlineStatus: "no_deadline",
      daysRemaining: null,
      overdueDays: 0,
    };
  }

  if (shippedAt) {
    const delta = daysBetween(deadline, shippedAt);
    return {
      deadlineStatus: delta > 0 ? "shipped_late" : "shipped",
      daysRemaining: 0,
      overdueDays: Math.max(0, delta),
    };
  }

  const delta = daysBetween(moscowDate(), deadline);
  if (delta < 0) {
    return {
      deadlineStatus: "overdue",
      daysRemaining: 0,
      overdueDays: Math.abs(delta),
    };
  }
  if (delta === 0) {
    return {
      deadlineStatus: "due_today",
      daysRemaining: 0,
      overdueDays: 0,
    };
  }
  if (delta <= 3) {
    return {
      deadlineStatus: "due_soon",
      daysRemaining: delta,
      overdueDays: 0,
    };
  }
  return {
    deadlineStatus: "on_track",
    daysRemaining: delta,
    overdueDays: 0,
  };
}

export function saveProjectDetails(input: ProjectDetailsInput) {
  syncCalculationMilestones();
  const deal = sqlite.prepare(`
    SELECT d.id
    FROM deals d
    JOIN deal_flow_state f ON f.deal_id = d.id AND f.calculation_entered_at IS NOT NULL
    WHERE d.id = ?
  `).get(input.dealId) as { id: string } | undefined;
  if (!deal) throw new Error("Проект появится после этапа «Расчёт»");

  const now = Date.now();
  const values = {
    dealId: input.dealId,
    orderedAt: optionalDate(input.orderedAt),
    contractDeadline: optionalDate(input.contractDeadline),
    shippedAt: optionalDate(input.shippedAt),
    notes: input.notes ? String(input.notes).trim() : null,
    createdAt: now,
    updatedAt: now,
  };

  sqlite.prepare(`
    INSERT INTO project_details (
      deal_id, ordered_at, contract_deadline, shipped_at, notes, created_at, updated_at
    ) VALUES (
      @dealId, @orderedAt, @contractDeadline, @shippedAt, @notes, @createdAt, @updatedAt
    )
    ON CONFLICT(deal_id) DO UPDATE SET
      ordered_at = excluded.ordered_at,
      contract_deadline = excluded.contract_deadline,
      shipped_at = excluded.shipped_at,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(values);

  return listProjects().find((project) => project.dealId === input.dealId) || null;
}

export function listProjects() {
  syncCalculationMilestones();

  const rows = sqlite.prepare(`
    SELECT
      d.id AS dealId,
      d.title AS title,
      d.value AS dealValue,
      d.created_at AS dealCreatedAt,
      d.updated_at AS dealUpdatedAt,
      c.id AS contactId,
      c.name AS contactName,
      c.company AS company,
      c.phone AS phone,
      c.email AS email,
      c.qualification AS qualification,
      ps.name AS stageName,
      flow.calculation_entered_at AS calculationEnteredAt,
      pd.ordered_at AS orderedAt,
      pd.contract_deadline AS contractDeadline,
      pd.shipped_at AS shippedAt,
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
    ORDER BY flow.calculation_entered_at DESC, d.created_at DESC
  `).all() as Array<Record<string, unknown>>;

  const projects = rows.map((row) => {
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
    const orderedAt = row.orderedAt ? String(row.orderedAt) : null;
    const contractDeadline = row.contractDeadline ? String(row.contractDeadline) : null;
    const shippedAt = row.shippedAt ? String(row.shippedAt) : null;
    const deadline = deadlineMetrics(contractDeadline, shippedAt);
    const productionDays = orderedAt
      ? Math.max(0, daysBetween(orderedAt, shippedAt || moscowDate()))
      : null;

    return {
      ...row,
      dealId: String(row.dealId || ""),
      orderedAt,
      contractDeadline,
      shippedAt,
      totalCost: costs,
      profit,
      margin,
      unpaid: Math.max(0, Number(row.dealValue || 0) - received),
      productionDays,
      ...deadline,
    };
  });

  const priority: Record<string, number> = {
    overdue: 0,
    due_today: 1,
    due_soon: 2,
    on_track: 3,
    no_deadline: 4,
    shipped_late: 5,
    shipped: 6,
  };

  return projects.sort((a, b) => {
    const p = (priority[String(a.deadlineStatus)] ?? 9) - (priority[String(b.deadlineStatus)] ?? 9);
    if (p !== 0) return p;
    const aDate = String(a.contractDeadline || "9999-12-31");
    const bDate = String(b.contractDeadline || "9999-12-31");
    return aDate.localeCompare(bDate);
  });
}