import { NextRequest, NextResponse } from "next/server";
import { sqlite } from "@/db";
import { getDealEconomics, saveDealEconomics } from "@/lib/economics";
import { calculateDealFinancials } from "@/lib/deal-financials";
import { getDealProcurementSummary, listDealPurchases } from "@/lib/procurement";
import { getDealSchedule } from "@/lib/deal-schedule";
import { getRequestActor } from "@/lib/request-actor";
import { writeAuditLog } from "@/lib/operations";
import { canSeeDealMoney } from "@/lib/access";

export const dynamic = "force-dynamic";

/** Всё по проекту для панели в «Производстве»: сроки, материалы, прочие расходы, итог. */
function load(dealId: string) {
  const deal = sqlite.prepare(`SELECT d.id, d.title, d.value, d.owner_id AS ownerId, c.id AS contactId, c.name AS contactName, ps.name AS stageName
    FROM deals d LEFT JOIN contacts c ON c.id=d.contact_id LEFT JOIN pipeline_stages ps ON ps.id=d.stage_id WHERE d.id=?`).get(dealId) as Record<string, unknown> | undefined;
  if (!deal) return null;
  const econ = (getDealEconomics(dealId) || {}) as Record<string, number>;
  const purchases = listDealPurchases(dealId);
  const procurement = getDealProcurementSummary(dealId);
  const finance = calculateDealFinancials({ ...econ, dealId, dealValue: Number(deal.value) || 0 });
  return {
    deal,
    schedule: getDealSchedule(dealId),
    purchases,
    procurement,
    costs: {
      receivedAmount: Number(econ.receivedAmount || 0),
      productionCost: Number(econ.productionCost || 0),
      deliveryCost: Number(econ.deliveryCost || 0),
      packagingCost: Number(econ.packagingCost || 0),
      contractorCost: Number(econ.contractorCost || 0),
      paymentCommission: Number(econ.paymentCommission || 0),
      taxCost: Number(econ.taxCost || 0),
      otherCost: Number(econ.otherCost || 0),
    },
    finance,
  };
}

/** Менеджеру — без затрат и прибыли; сумма и оплата видны только по своей сделке. */
function forActor<T extends NonNullable<ReturnType<typeof load>>>(data: T, actor: ReturnType<typeof getRequestActor>) {
  if (actor.role === "owner") return { ...data, restricted: false };
  const own = canSeeDealMoney(actor, (data.deal as { ownerId?: string | null }).ownerId);
  const zero = Object.fromEntries(Object.keys(data.costs).map((k) => [k, 0])) as T["costs"];
  return {
    ...data,
    restricted: true,
    deal: { ...data.deal, value: own ? data.deal.value : 0 },
    costs: { ...zero, receivedAmount: own ? data.costs.receivedAmount : 0 },
    finance: { directCost: 0, profit: 0, margin: 0, managerCommission: 0 },
  };
}

export async function GET(request: NextRequest) {
  const dealId = new URL(request.url).searchParams.get("dealId") || "";
  const data = load(dealId);
  if (!data) return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
  return NextResponse.json(forActor(data, getRequestActor(request)));
}

export async function PUT(request: NextRequest) {
  const actor = getRequestActor(request);
  if (actor.role === "viewer") return NextResponse.json({ error: "Режим просмотра" }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 }); }
  const dealId = String(body.dealId || "");
  const current = load(dealId);
  if (!current) return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
  if (actor.role !== "owner") {
    // Менеджер: затраты не правит; оплату — только по своей сделке.
    const own = canSeeDealMoney(actor, (current.deal as { ownerId?: string | null }).ownerId);
    for (const k of Object.keys(current.costs)) if (k !== "receivedAmount" || !own) delete body[k];
  }
  const kop = (key: string) => body[key] === undefined ? (current.costs as Record<string, number>)[key] : Math.max(0, Math.round(Number(body[key]) || 0));
  const prev = (getDealEconomics(dealId) || {}) as Record<string, unknown>;
  saveDealEconomics({
    dealId,
    receivedAmount: kop("receivedAmount"),
    productionCost: kop("productionCost"),
    paymentCommission: kop("paymentCommission"),
    paymentCommissionRate: Number(prev.paymentCommissionRate || 0),
    deliveryCost: kop("deliveryCost"),
    packagingCost: kop("packagingCost"),
    contractorCost: kop("contractorCost"),
    taxCost: kop("taxCost"),
    otherCost: kop("otherCost"),
    notes: (prev.notes as string) || null,
  });
  writeAuditLog(actor, "update_project_costs", "deal", dealId, body);
  return NextResponse.json(forActor(load(dealId)!, actor));
}
