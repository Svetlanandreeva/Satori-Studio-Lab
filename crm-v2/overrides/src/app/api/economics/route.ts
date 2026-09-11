import { NextRequest, NextResponse } from "next/server";
import {
  createBusinessExpense,
  deleteBusinessExpense,
  listBusinessExpenses,
  listEconomics,
  saveDealEconomics,
} from "@/lib/economics";

export const dynamic = "force-dynamic";

function currentMonth(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || String(new Date().getFullYear());
  const month = parts.find((part) => part.type === "month")?.value || "01";
  return `${year}-${month}`;
}

export async function GET(request: NextRequest) {
  try {
    const month = new URL(request.url).searchParams.get("month") || currentMonth();
    const report = listEconomics();
    const fixedExpenses = listBusinessExpenses(month);
    return NextResponse.json({ ...report, fixedExpenses });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить экономику" },
      { status: 500 }
    );
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
    if (!dealId) {
      return NextResponse.json({ error: "Не указана сделка" }, { status: 400 });
    }

    const result = saveDealEconomics({
      dealId,
      receivedAmount: cents(body.receivedAmount),
      productionCost: cents(body.productionCost),
      paymentCommission: cents(body.paymentCommission),
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
      notes: body.notes ? String(body.notes) : null,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось добавить постоянный расход" },
      { status: 400 }
    );
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось удалить расход" },
      { status: 500 }
    );
  }
}
