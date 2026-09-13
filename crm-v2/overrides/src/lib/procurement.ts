import { sqlite } from "@/db";

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS deal_purchases (
    id TEXT PRIMARY KEY,
    deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'шт.',
    unit_cost INTEGER NOT NULL DEFAULT 0,
    total_cost INTEGER NOT NULL DEFAULT 0,
    supplier TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_deal_purchases_deal ON deal_purchases(deal_id, created_at DESC);
`);

function ensureColumn(name: string, definition: string) {
  const columns = sqlite.prepare("PRAGMA table_info(deal_purchases)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === name)) {
    sqlite.exec(`ALTER TABLE deal_purchases ADD COLUMN ${definition}`);
  }
}

// Миграции выполняются безопасно при старте: старые закупки продолжают работать,
// а новые поля становятся доступны без отдельного migration runner на VPS.
ensureColumn("planned_unit_cost", "planned_unit_cost INTEGER NOT NULL DEFAULT 0");
ensureColumn("status", "status TEXT NOT NULL DEFAULT 'received'");
ensureColumn("purchase_date", "purchase_date TEXT");
ensureColumn("source_url", "source_url TEXT");

export const PURCHASE_STATUSES = ["planned", "ordered", "paid", "received"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export interface DealPurchaseInput {
  id?: string;
  dealId: string;
  name: string;
  quantity?: number;
  unit?: string;
  plannedUnitCost?: number;
  unitCost?: number;
  supplier?: string | null;
  status?: PurchaseStatus | string;
  purchaseDate?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
}

export interface DealPurchase {
  id: string;
  dealId: string;
  name: string;
  quantity: number;
  unit: string;
  plannedUnitCost: number;
  plannedTotalCost: number;
  unitCost: number;
  totalCost: number;
  variance: number;
  supplier: string | null;
  status: PurchaseStatus;
  purchaseDate: string | null;
  sourceUrl: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DealProcurementSummary {
  plannedTotal: number;
  actualTotal: number;
  variance: number;
  itemsCount: number;
}

function amount(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function signedAmount(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function quantity(value: unknown): number {
  const number = Number(value ?? 1);
  if (!Number.isFinite(number) || number <= 0) return 1;
  return Math.round(number * 1000) / 1000;
}

function purchaseStatus(value: unknown): PurchaseStatus {
  const normalized = String(value || "planned").trim().toLowerCase();
  return PURCHASE_STATUSES.includes(normalized as PurchaseStatus) ? normalized as PurchaseStatus : "planned";
}

function purchaseDate(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function sourceUrl(value: unknown): string | null {
  const normalized = String(value || "").trim().slice(0, 2000);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function rowSelect() {
  return `id, deal_id AS dealId, name, quantity, unit,
    planned_unit_cost AS plannedUnitCost,
    CAST(ROUND(quantity * CASE WHEN planned_unit_cost > 0 THEN planned_unit_cost ELSE unit_cost END) AS INTEGER) AS plannedTotalCost,
    unit_cost AS unitCost, total_cost AS totalCost,
    CAST(total_cost - ROUND(quantity * CASE WHEN planned_unit_cost > 0 THEN planned_unit_cost ELSE unit_cost END) AS INTEGER) AS variance,
    supplier, status, purchase_date AS purchaseDate, source_url AS sourceUrl, notes,
    created_at AS createdAt, updated_at AS updatedAt`;
}

export function listDealPurchases(dealId: string): DealPurchase[] {
  return sqlite.prepare(`SELECT ${rowSelect()} FROM deal_purchases WHERE deal_id=? ORDER BY created_at ASC, id ASC`)
    .all(dealId) as DealPurchase[];
}

export function getDealProcurementSummary(dealId: string): DealProcurementSummary {
  if (!dealId) return { plannedTotal: 0, actualTotal: 0, variance: 0, itemsCount: 0 };
  const row = sqlite.prepare(`
    SELECT
      COALESCE(SUM(CAST(ROUND(quantity * CASE WHEN planned_unit_cost > 0 THEN planned_unit_cost ELSE unit_cost END) AS INTEGER)), 0) AS plannedTotal,
      COALESCE(SUM(total_cost), 0) AS actualTotal,
      COUNT(*) AS itemsCount
    FROM deal_purchases
    WHERE deal_id=?
  `).get(dealId) as { plannedTotal?: number; actualTotal?: number; itemsCount?: number } | undefined;
  const plannedTotal = amount(row?.plannedTotal || 0);
  const actualTotal = amount(row?.actualTotal || 0);
  return {
    plannedTotal,
    actualTotal,
    variance: signedAmount(actualTotal - plannedTotal),
    itemsCount: Math.max(0, Number(row?.itemsCount || 0)),
  };
}

export function getDealProcurementTotal(dealId: string): number {
  return getDealProcurementSummary(dealId).actualTotal;
}

export function getDealProcurementPlannedTotal(dealId: string): number {
  return getDealProcurementSummary(dealId).plannedTotal;
}

export function saveDealPurchase(input: DealPurchaseInput): DealPurchase {
  const dealId = String(input.dealId || "").trim();
  const name = String(input.name || "").trim();
  if (!dealId) throw new Error("Не указана сделка");
  if (!name) throw new Error("Укажите материал или комплектующую");
  const deal = sqlite.prepare("SELECT id FROM deals WHERE id=?").get(dealId);
  if (!deal) throw new Error("Сделка не найдена");

  const qty = quantity(input.quantity);
  const plannedUnitCost = amount(input.plannedUnitCost);
  const unitCost = amount(input.unitCost);
  const totalCost = Math.round(qty * unitCost);
  const unit = String(input.unit || "шт.").trim().slice(0, 24) || "шт.";
  const supplier = String(input.supplier || "").trim().slice(0, 160) || null;
  const status = purchaseStatus(input.status);
  const date = purchaseDate(input.purchaseDate);
  const url = sourceUrl(input.sourceUrl);
  const notes = String(input.notes || "").trim().slice(0, 1000) || null;
  const now = Date.now();

  if (input.id) {
    const existing = sqlite.prepare("SELECT id FROM deal_purchases WHERE id=? AND deal_id=?").get(input.id, dealId);
    if (!existing) throw new Error("Позиция закупки не найдена");
    sqlite.prepare(`UPDATE deal_purchases SET
      name=?,quantity=?,unit=?,planned_unit_cost=?,unit_cost=?,total_cost=?,supplier=?,status=?,purchase_date=?,source_url=?,notes=?,updated_at=?
      WHERE id=? AND deal_id=?`)
      .run(name, qty, unit, plannedUnitCost, unitCost, totalCost, supplier, status, date, url, notes, now, input.id, dealId);
    return listDealPurchases(dealId).find((item) => item.id === input.id)!;
  }

  const id = crypto.randomUUID();
  sqlite.prepare(`INSERT INTO deal_purchases(
    id,deal_id,name,quantity,unit,planned_unit_cost,unit_cost,total_cost,supplier,status,purchase_date,source_url,notes,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, dealId, name, qty, unit, plannedUnitCost, unitCost, totalCost, supplier, status, date, url, notes, now, now);
  return listDealPurchases(dealId).find((item) => item.id === id)!;
}

export function deleteDealPurchase(id: string): boolean {
  return sqlite.prepare("DELETE FROM deal_purchases WHERE id=?").run(id).changes > 0;
}

export function listProcurementOverview() {
  const deals = sqlite.prepare(`
    SELECT d.id AS dealId,d.title AS dealTitle,d.value AS dealValue,c.id AS contactId,c.name AS contactName,
      c.company,ps.name AS stageName,
      COALESCE(SUM(CAST(ROUND(p.quantity * CASE WHEN p.planned_unit_cost > 0 THEN p.planned_unit_cost ELSE p.unit_cost END) AS INTEGER)),0) AS plannedProcurementCost,
      COALESCE(SUM(p.total_cost),0) AS procurementCost,
      COALESCE(SUM(p.total_cost),0) - COALESCE(SUM(CAST(ROUND(p.quantity * CASE WHEN p.planned_unit_cost > 0 THEN p.planned_unit_cost ELSE p.unit_cost END) AS INTEGER)),0) AS procurementVariance,
      COUNT(p.id) AS itemsCount
    FROM deals d
    JOIN contacts c ON c.id=d.contact_id
    JOIN pipeline_stages ps ON ps.id=d.stage_id
    LEFT JOIN deal_purchases p ON p.deal_id=d.id
    WHERE COALESCE(ps.is_lost,0)=0 AND COALESCE(c.qualification,'new') NOT IN ('spam','ignore')
    GROUP BY d.id,d.title,d.value,c.id,c.name,c.company,ps.name
    ORDER BY d.updated_at DESC
  `).all() as Array<Record<string, unknown>>;

  const purchases = sqlite.prepare(`
    SELECT p.id,p.deal_id AS dealId,p.name,p.quantity,p.unit,
      p.planned_unit_cost AS plannedUnitCost,
      CAST(ROUND(p.quantity * CASE WHEN p.planned_unit_cost > 0 THEN p.planned_unit_cost ELSE p.unit_cost END) AS INTEGER) AS plannedTotalCost,
      p.unit_cost AS unitCost,p.total_cost AS totalCost,
      CAST(p.total_cost - ROUND(p.quantity * CASE WHEN p.planned_unit_cost > 0 THEN p.planned_unit_cost ELSE p.unit_cost END) AS INTEGER) AS variance,
      p.supplier,p.status,p.purchase_date AS purchaseDate,p.source_url AS sourceUrl,p.notes,
      p.created_at AS createdAt,p.updated_at AS updatedAt,
      d.title AS dealTitle,c.name AS contactName
    FROM deal_purchases p JOIN deals d ON d.id=p.deal_id JOIN contacts c ON c.id=d.contact_id
    ORDER BY p.created_at DESC
  `).all() as Array<Record<string, unknown>>;

  const plannedTotal = purchases.reduce((sum, item) => sum + amount(item.plannedTotalCost), 0);
  const actualTotal = purchases.reduce((sum, item) => sum + amount(item.totalCost), 0);

  return {
    deals,
    purchases,
    plannedTotal,
    actualTotal,
    variance: signedAmount(actualTotal - plannedTotal),
    total: actualTotal,
  };
}
