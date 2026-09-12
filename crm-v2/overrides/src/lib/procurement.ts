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

export interface DealPurchaseInput {
  id?: string;
  dealId: string;
  name: string;
  quantity?: number;
  unit?: string;
  unitCost?: number;
  supplier?: string | null;
  notes?: string | null;
}

export interface DealPurchase {
  id: string;
  dealId: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  supplier: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

function amount(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function quantity(value: unknown): number {
  const number = Number(value ?? 1);
  if (!Number.isFinite(number) || number <= 0) return 1;
  return Math.round(number * 1000) / 1000;
}

function rowSelect() {
  return `id, deal_id AS dealId, name, quantity, unit, unit_cost AS unitCost,
    total_cost AS totalCost, supplier, notes, created_at AS createdAt, updated_at AS updatedAt`;
}

export function listDealPurchases(dealId: string): DealPurchase[] {
  return sqlite.prepare(`SELECT ${rowSelect()} FROM deal_purchases WHERE deal_id=? ORDER BY created_at ASC, id ASC`)
    .all(dealId) as DealPurchase[];
}

export function getDealProcurementTotal(dealId: string): number {
  if (!dealId) return 0;
  const row = sqlite.prepare("SELECT COALESCE(SUM(total_cost),0) AS total FROM deal_purchases WHERE deal_id=?").get(dealId) as { total?: number } | undefined;
  return amount(row?.total || 0);
}

export function saveDealPurchase(input: DealPurchaseInput): DealPurchase {
  const dealId = String(input.dealId || "").trim();
  const name = String(input.name || "").trim();
  if (!dealId) throw new Error("Не указана сделка");
  if (!name) throw new Error("Укажите материал или комплектующую");
  const deal = sqlite.prepare("SELECT id FROM deals WHERE id=?").get(dealId);
  if (!deal) throw new Error("Сделка не найдена");

  const qty = quantity(input.quantity);
  const unitCost = amount(input.unitCost);
  const totalCost = Math.round(qty * unitCost);
  const unit = String(input.unit || "шт.").trim().slice(0, 24) || "шт.";
  const supplier = String(input.supplier || "").trim().slice(0, 160) || null;
  const notes = String(input.notes || "").trim().slice(0, 1000) || null;
  const now = Date.now();

  if (input.id) {
    const existing = sqlite.prepare("SELECT id FROM deal_purchases WHERE id=? AND deal_id=?").get(input.id, dealId);
    if (!existing) throw new Error("Позиция закупки не найдена");
    sqlite.prepare(`UPDATE deal_purchases SET name=?,quantity=?,unit=?,unit_cost=?,total_cost=?,supplier=?,notes=?,updated_at=? WHERE id=? AND deal_id=?`)
      .run(name, qty, unit, unitCost, totalCost, supplier, notes, now, input.id, dealId);
    return listDealPurchases(dealId).find((item) => item.id === input.id)!;
  }

  const id = crypto.randomUUID();
  sqlite.prepare(`INSERT INTO deal_purchases(id,deal_id,name,quantity,unit,unit_cost,total_cost,supplier,notes,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, dealId, name, qty, unit, unitCost, totalCost, supplier, notes, now, now);
  return listDealPurchases(dealId).find((item) => item.id === id)!;
}

export function deleteDealPurchase(id: string): boolean {
  return sqlite.prepare("DELETE FROM deal_purchases WHERE id=?").run(id).changes > 0;
}

export function listProcurementOverview() {
  const deals = sqlite.prepare(`
    SELECT d.id AS dealId,d.title AS dealTitle,d.value AS dealValue,c.id AS contactId,c.name AS contactName,
      c.company,ps.name AS stageName,COALESCE(SUM(p.total_cost),0) AS procurementCost,COUNT(p.id) AS itemsCount
    FROM deals d
    JOIN contacts c ON c.id=d.contact_id
    JOIN pipeline_stages ps ON ps.id=d.stage_id
    LEFT JOIN deal_purchases p ON p.deal_id=d.id
    WHERE COALESCE(ps.is_lost,0)=0 AND COALESCE(c.qualification,'new') NOT IN ('spam','ignore')
    GROUP BY d.id,d.title,d.value,c.id,c.name,c.company,ps.name
    ORDER BY d.updated_at DESC
  `).all() as Array<Record<string, unknown>>;

  const purchases = sqlite.prepare(`
    SELECT p.id,p.deal_id AS dealId,p.name,p.quantity,p.unit,p.unit_cost AS unitCost,p.total_cost AS totalCost,
      p.supplier,p.notes,p.created_at AS createdAt,p.updated_at AS updatedAt,
      d.title AS dealTitle,c.name AS contactName
    FROM deal_purchases p JOIN deals d ON d.id=p.deal_id JOIN contacts c ON c.id=d.contact_id
    ORDER BY p.created_at DESC
  `).all() as Array<Record<string, unknown>>;

  return {
    deals,
    purchases,
    total: purchases.reduce((sum, item) => sum + amount(item.totalCost), 0),
  };
}
