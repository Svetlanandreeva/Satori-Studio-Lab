import { sqlite } from "@/db";
import { directCostFromEconomics } from "@/lib/deal-financials";

/**
 * «Заработано» менеджера: его доля от прибыли по его сделкам (где он ответственный).
 * Прибыль = получено от клиента − все прямые затраты по проекту (материалы, доставка, упаковка, подрядчики, комиссии, налог, прочее).
 * Доля по умолчанию 50%. Пока проект не завершён — сумма предварительная (затраты могут добавиться).
 */

export const DEFAULT_RATE = 50;

function ensure() {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS manager_payouts (
    id TEXT PRIMARY KEY, member_id TEXT NOT NULL, amount INTEGER NOT NULL, paid_at TEXT NOT NULL, note TEXT, created_at INTEGER NOT NULL
  )`);
}

const setting = (k: string) => (sqlite.prepare("SELECT value FROM crm_settings WHERE key=?").get(k) as { value?: string } | undefined)?.value;

export function commissionRate(memberId: string): number {
  const v = Number(setting(`commission_rate:${memberId}`));
  return Number.isFinite(v) && v >= 0 && v <= 100 && setting(`commission_rate:${memberId}`) != null ? v : DEFAULT_RATE;
}
export function setCommissionRate(memberId: string, rate: number) {
  const r = Math.max(0, Math.min(100, Math.round(rate * 10) / 10));
  sqlite.prepare("INSERT INTO crm_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(`commission_rate:${memberId}`, String(r));
  return r;
}

export type EarningRow = {
  dealId: string; title: string; client: string | null; stage: string | null; done: boolean;
  paidAt: string | null; received: number; directCost: number; profit: number; share: number;
};
export type Payout = { id: string; amount: number; paidAt: string; note: string | null };

export function managerEarnings(memberId: string) {
  ensure();
  const rate = commissionRate(memberId);
  const rows = sqlite.prepare(`SELECT d.id, d.title, c.name AS client, ps.name AS stage, COALESCE(ps.is_won,0) AS won, COALESCE(ps.is_lost,0) AS lost,
      pd.ordered_at AS paidAt, pd.shipped_at AS shippedAt, e.*
    FROM deals d LEFT JOIN contacts c ON c.id=d.contact_id LEFT JOIN pipeline_stages ps ON ps.id=d.stage_id
    LEFT JOIN project_details pd ON pd.deal_id=d.id LEFT JOIN deal_economics e ON e.deal_id=d.id
    WHERE d.owner_id=?`).all(memberId) as Array<Record<string, unknown>>;
  const deals: EarningRow[] = rows
    .map((r) => {
      const received = Number(r.received_amount || 0);
      const directCost = directCostFromEconomics({
        dealId: r.id, productionCost: r.production_cost, paymentCommission: r.payment_commission, deliveryCost: r.delivery_cost,
        packagingCost: r.packaging_cost, contractorCost: r.contractor_cost, taxCost: r.tax_cost, otherCost: r.other_cost,
      });
      const profit = received - directCost;
      return {
        dealId: String(r.id), title: String(r.title || "Без названия"), client: (r.client as string) || null, stage: (r.stage as string) || null,
        done: Boolean(r.won) || Boolean(r.shippedAt), paidAt: r.paidAt ? String(r.paidAt).slice(0, 10) : null,
        received, directCost, profit, share: Math.max(0, Math.round((profit * rate) / 100)), lost: Boolean(r.lost),
      };
    })
    .filter((r) => r.received > 0 && !r.lost)
    .map(({ lost: _lost, ...r }) => r)
    .sort((a, b) => String(b.paidAt || "").localeCompare(String(a.paidAt || "")));
  const payouts = (sqlite.prepare("SELECT id, amount, paid_at AS paidAt, note FROM manager_payouts WHERE member_id=? ORDER BY paid_at DESC, created_at DESC").all(memberId) as Payout[]);
  const earned = deals.filter((d) => d.done).reduce((s, d) => s + d.share, 0);
  const pending = deals.filter((d) => !d.done).reduce((s, d) => s + d.share, 0);
  const paid = payouts.reduce((s, p) => s + p.amount, 0);
  return { rate, deals, payouts, totals: { earned, pending, paid, due: earned - paid } };
}

export function addPayout(memberId: string, amount: number, paidAt: string, note: string | null) {
  ensure();
  if (!(amount > 0)) throw new Error("Укажите сумму выплаты");
  const id = crypto.randomUUID();
  sqlite.prepare("INSERT INTO manager_payouts(id, member_id, amount, paid_at, note, created_at) VALUES(?,?,?,?,?,?)")
    .run(id, memberId, Math.round(amount), /^\d{4}-\d{2}-\d{2}$/.test(paidAt) ? paidAt : new Date().toISOString().slice(0, 10), note?.slice(0, 300) || null, Date.now());
  return id;
}
export function deletePayout(id: string) { ensure(); return sqlite.prepare("DELETE FROM manager_payouts WHERE id=?").run(id).changes > 0; }
