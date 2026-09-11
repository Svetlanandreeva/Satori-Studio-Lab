import { NextRequest, NextResponse } from "next/server";
import { listEconomics, saveDealEconomics } from "@/lib/economics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(listEconomics());
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
