import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

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
  )
`);

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

function money(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number));
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

export function listEconomics() {
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
      e.updated_at AS economicsUpdatedAt
    FROM deals d
    JOIN contacts c ON c.id = d.contact_id
    JOIN pipeline_stages ps ON ps.id = d.stage_id
    LEFT JOIN deal_economics e ON e.deal_id = d.id
    WHERE COALESCE(c.qualification, 'new') <> 'spam'
      AND ps.name <> 'Песочница / Спам'
    ORDER BY d.created_at DESC
  `).all() as Array<Record<string, unknown>>;

  const normalized = rows.map((row) => {
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
    const contactId = String(row.contactId);
    const current = clients.get(contactId) || {
      contactId,
      contactName: String(row.contactName || "Без имени"),
      company: row.company ? String(row.company) : null,
      deals: 0,
      receivedAmount: 0,
      totalCost: 0,
      profit: 0,
    };
    current.deals += 1;
    current.receivedAmount += Number(row.receivedAmount || 0);
    current.totalCost += Number(row.totalCost || 0);
    current.profit += Number(row.profit || 0);
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
      acc.dealValue += Number(row.dealValue || 0);
      acc.receivedAmount += Number(row.receivedAmount || 0);
      acc.totalCost += Number(row.totalCost || 0);
      acc.profit += Number(row.profit || 0);
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
