import { NextRequest, NextResponse } from "next/server";
import {
  deleteDealPurchase,
  getDealProcurementSummary,
  listDealPurchases,
  listProcurementOverview,
  saveDealPurchase,
} from "@/lib/procurement";
import { getRequestActor } from "@/lib/request-actor";
import { writeAuditLog } from "@/lib/operations";

export const dynamic = "force-dynamic";

function assertCanEdit(request: NextRequest) {
  const actor = getRequestActor(request);
  if (actor.role === "viewer") throw new Error("Режим просмотра: изменение закупок недоступно");
  return actor;
}

export async function GET(request: NextRequest) {
  try {
    const dealId = new URL(request.url).searchParams.get("dealId");
    if (dealId) {
      return NextResponse.json({
        purchases: listDealPurchases(dealId),
        summary: getDealProcurementSummary(dealId),
      });
    }
    return NextResponse.json(listProcurementOverview());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось загрузить закупки" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = assertCanEdit(request);
    const body = await request.json() as Record<string, unknown>;
    const purchase = saveDealPurchase({
      id: body.id ? String(body.id) : undefined,
      dealId: String(body.dealId || ""),
      name: String(body.name || ""),
      quantity: Number(body.quantity || 1),
      unit: String(body.unit || "шт."),
      plannedUnitCost: Number(body.plannedUnitCost || 0),
      unitCost: Number(body.unitCost || 0),
      supplier: body.supplier ? String(body.supplier) : null,
      status: body.status ? String(body.status) : "planned",
      purchaseDate: body.purchaseDate ? String(body.purchaseDate) : null,
      sourceUrl: body.sourceUrl ? String(body.sourceUrl) : null,
      notes: body.notes ? String(body.notes) : null,
    });
    const summary = getDealProcurementSummary(purchase.dealId);
    writeAuditLog(actor, body.id ? "update_purchase" : "create_purchase", "deal", purchase.dealId, {
      purchaseId: purchase.id,
      name: purchase.name,
      quantity: purchase.quantity,
      unit: purchase.unit,
      plannedUnitCost: purchase.plannedUnitCost,
      plannedTotalCost: purchase.plannedTotalCost,
      unitCost: purchase.unitCost,
      totalCost: purchase.totalCost,
      variance: purchase.variance,
      status: purchase.status,
      purchaseDate: purchase.purchaseDate,
      sourceUrl: purchase.sourceUrl,
    });
    return NextResponse.json({ purchase, summary }, { status: body.id ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось сохранить закупку" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = assertCanEdit(request);
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id) return NextResponse.json({ error: "Не указана позиция" }, { status: 400 });
    const removed = deleteDealPurchase(id);
    if (!removed) return NextResponse.json({ error: "Позиция закупки не найдена" }, { status: 404 });
    writeAuditLog(actor, "delete_purchase", "purchase", id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось удалить закупку" }, { status: 400 });
  }
}
