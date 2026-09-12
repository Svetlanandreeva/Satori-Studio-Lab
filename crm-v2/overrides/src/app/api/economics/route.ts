import { NextRequest, NextResponse } from "next/server";
import {
  createBusinessExpense,
  deleteBusinessExpense,
  listBusinessExpenses,
  listEconomics,
  saveDealEconomics,
  setBusinessExpensePaidAt,
  taxBaseForPaymentMonth,
} from "@/lib/economics";
import { calculateFinancialsFromDirectCost, MANAGER_COMMISSION_RATE } from "@/lib/deal-financials";
import { getDealProcurementTotal, listDealPurchases } from "@/lib/procurement";

export const dynamic = "force-dynamic";

function currentMonth(): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || String(new Date().getFullYear());
  const month = parts.find((part) => part.type === "month")?.value || "01";
  return `${year}-${month}`;
}

function isRejectedStage(name: unknown): boolean {
  return String(name || "").trim().toLowerCase().replace(/ё/g, "е").includes("отказ");
}

function withManagerCommission<T extends {
  dealId: string;
  receivedAmount: number;
  totalCost: number;
  profit: number;
  margin: number;
  dealValue?: number;
}>(row: T) {
  const procurementCost = getDealProcurementTotal(row.dealId);
  const directCostBeforeProcurement = Number(row.totalCost || 0);
  const directCost = directCostBeforeProcurement + procurementCost;
  return {
    ...row,
    procurementCost,
    purchases: listDealPurchases(row.dealId),
    ...calculateFinancialsFromDirectCost(row.receivedAmount, directCost, row.dealValue || 0),
  };
}

function withoutRejectedDeals(report: ReturnType<typeof listEconomics>) {
  const deals = report.deals
    .filter((deal) => !isRejectedStage(deal.stageName))
    .map((deal) => withManagerCommission(deal));
  const clients = new Map<string, { contactId: string; contactName: string; company: string | null; deals: number; receivedAmount: number; directCost: number; procurementCost: number; managerCommission: number; totalCost: number; profit: number }>();
  for (const row of deals) {
    const current = clients.get(row.contactId) || { contactId: row.contactId, contactName: row.contactName || "Без имени", company: row.company, deals: 0, receivedAmount: 0, directCost: 0, procurementCost: 0, managerCommission: 0, totalCost: 0, profit: 0 };
    current.deals += 1;
    current.receivedAmount += Number(row.receivedAmount || 0);
    current.directCost += Number(row.directCost || 0);
    current.procurementCost += Number(row.procurementCost || 0);
    current.managerCommission += Number(row.managerCommission || 0);
    current.totalCost += Number(row.totalCost || 0);
    current.profit += Number(row.profit || 0);
    clients.set(row.contactId, current);
  }
  const clientRows = Array.from(clients.values()).map((client) => ({ ...client, margin: client.receivedAmount > 0 ? (client.profit / client.receivedAmount) * 100 : 0 })).sort((a, b) => b.profit - a.profit);
  const totals = deals.reduce((acc, row) => {
    acc.dealValue += Number(row.dealValue || 0);
    acc.receivedAmount += Number(row.receivedAmount || 0);
    acc.directCost += Number(row.directCost || 0);
    acc.procurementCost += Number(row.procurementCost || 0);
    acc.managerCommission += Number(row.managerCommission || 0);
    acc.totalCost += Number(row.totalCost || 0);
    acc.profitBeforeManager += Number(row.profitBeforeManager || 0);
    acc.profit += Number(row.profit || 0);
    return acc;
  }, { dealValue: 0, receivedAmount: 0, directCost: 0, procurementCost: 0, managerCommission: 0, totalCost: 0, profitBeforeManager: 0, profit: 0 });
  return { deals, clients: clientRows, totals: { ...totals, managerCommissionRate: MANAGER_COMMISSION_RATE, margin: totals.receivedAmount > 0 ? (totals.profit / totals.receivedAmount) * 100 : 0 } };
}

export async function GET(request: NextRequest) {
  try {
    const month = new URL(request.url).searchParams.get("month") || currentMonth();
    const report = withoutRejectedDeals(listEconomics());
    const fixedExpenses = listBusinessExpenses(month);
    return NextResponse.json({ ...report, fixedExpenses, taxBase: taxBaseForPaymentMonth(month) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось загрузить экономику" }, { status: 500 });
  }
}

function cents(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number));
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const dealId = String(body.dealId || "").trim();
    if (!dealId) return NextResponse.json({ error: "Не указана сделка" }, { status: 400 });
    const result = saveDealEconomics({
      dealId,
      receivedAmount: cents(body.receivedAmount),
      productionCost: cents(body.productionCost),
      paymentCommission: body.paymentCommission === undefined ? undefined : cents(body.paymentCommission),
      paymentCommissionRate: body.paymentCommissionRate === undefined ? undefined : Number(body.paymentCommissionRate) || 0,
      deliveryCost: cents(body.deliveryCost),
      packagingCost: cents(body.packagingCost),
      contractorCost: cents(body.contractorCost),
      taxCost: cents(body.taxCost),
      otherCost: cents(body.otherCost),
      notes: body.notes ? String(body.notes) : null,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить экономику";
    return NextResponse.json({ error: message }, { status: message === "Сделка не найдена" ? 404 : 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = createBusinessExpense({
      month: String(body.month || ""),
      name: String(body.name || ""),
      category: body.category ? String(body.category) : "other",
      amount: cents(body.amount),
      expenseType: body.expenseType === "percent" ? "percent" : "fixed",
      percentRate: Number(body.percentRate) || 0,
      percentBaseAmount: cents(body.percentBaseAmount),
      dueDate: body.dueDate ? String(body.dueDate) : null,
      paidAt: body.paidAt ? String(body.paidAt) : null,
      recurringMonthly: body.recurringMonthly !== false,
      notes: body.notes ? String(body.notes) : null,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось добавить расход" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const expenseId = String(body.expenseId || "").trim();
    if (!expenseId) return NextResponse.json({ error: "Не указан расход" }, { status: 400 });
    const result = setBusinessExpensePaidAt(expenseId, body.paidAt ? String(body.paidAt) : null);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось обновить оплату";
    return NextResponse.json({ error: message }, { status: message === "Расход не найден" ? 404 : 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("expenseId") || "";
    if (!id) return NextResponse.json({ error: "Не указан расход" }, { status: 400 });
    const removed = deleteBusinessExpense(id);
    if (!removed) return NextResponse.json({ error: "Расход не найден" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось удалить расход" }, { status: 500 });
  }
}
