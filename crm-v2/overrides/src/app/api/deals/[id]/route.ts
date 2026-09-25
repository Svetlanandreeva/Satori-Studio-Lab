import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals, pipelineStages, teamMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { pushDealStageToStorefront } from "@/lib/store-orders";
import { annotateLatestStageHistory, writeAuditLog } from "@/lib/operations";
import { getRequestActor } from "@/lib/request-actor";
import { lockDealFields } from "@/lib/deal-overrides";
import { getDealEconomics, saveDealEconomics } from "@/lib/economics";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = db
    .select({
      id: deals.id, title: deals.title, value: deals.value, stageId: deals.stageId, contactId: deals.contactId,
      ownerId: deals.ownerId, lossReason: deals.lossReason, expectedClose: deals.expectedClose,
      probability: deals.probability, notes: deals.notes, createdAt: deals.createdAt, updatedAt: deals.updatedAt,
      ownerName: teamMembers.name,
    })
    .from(deals)
    .leftJoin(teamMembers, eq(deals.ownerId, teamMembers.id))
    .where(eq(deals.id, id)).get();
  if (!deal) return NextResponse.json({ error: "Сделка не найдена" }, { status: 404 });
  return NextResponse.json({ ...deal, economics: getDealEconomics(id) });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 }); }

  const existing = db.select().from(deals).where(eq(deals.id, id)).get();
  if (!existing) return NextResponse.json({ error: "Сделка не найдена" }, { status: 404 });
  const actor = getRequestActor(request);
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (body.title !== undefined) updateData.title = String(body.title || "").trim();
  if (body.value !== undefined) updateData.value = Math.max(0, Number(body.value) || 0);
  if (body.contactId !== undefined) updateData.contactId = String(body.contactId);
  if (body.ownerId !== undefined) {
    const ownerId = String(body.ownerId || "").trim() || null;
    if (ownerId) {
      const owner = db.select().from(teamMembers).where(eq(teamMembers.id, ownerId)).get();
      if (!owner || !owner.active) return NextResponse.json({ error: "Ответственный не найден или отключён" }, { status: 400 });
    }
    updateData.ownerId = ownerId;
  }
  if (body.expectedClose !== undefined) updateData.expectedClose = body.expectedClose ? new Date(String(body.expectedClose)) : null;
  if (body.probability !== undefined) updateData.probability = Math.max(0, Math.min(100, Number(body.probability)));
  if (body.notes !== undefined) updateData.notes = body.notes ? String(body.notes) : null;
  if (body.lossReason !== undefined && body.stageId === undefined) updateData.lossReason = body.lossReason ? String(body.lossReason).trim() : null;

  let stage = null as any;
  if (body.stageId !== undefined) {
    stage = db.select().from(pipelineStages).where(eq(pipelineStages.id, String(body.stageId))).get();
    if (!stage) return NextResponse.json({ error: "Этап не найден" }, { status: 400 });
    const reason = String(body.lossReason || "").trim();
    if (stage.isLost && !reason) return NextResponse.json({ error: "Для отказа укажите причину" }, { status: 400 });
    updateData.stageId = stage.id;
    updateData.lossReason = stage.isLost ? reason : null;
  }

  const result = db.update(deals).set(updateData).where(eq(deals.id, id)).returning().get();

  if (body.receivedAmount !== undefined) {
    const current = (getDealEconomics(id) || {}) as any;
    saveDealEconomics({
      dealId: id,
      receivedAmount: Math.max(0, Number(body.receivedAmount) || 0),
      productionCost: Number(current.productionCost || 0),
      paymentCommission: Number(current.paymentCommission || 0),
      paymentCommissionRate: Number(current.paymentCommissionRate || 0),
      deliveryCost: Number(current.deliveryCost || 0),
      packagingCost: Number(current.packagingCost || 0),
      contractorCost: Number(current.contractorCost || 0),
      taxCost: Number(current.taxCost || 0),
      otherCost: Number(current.otherCost || 0),
      notes: current.notes || null,
    });
  }

  // Status, agreed amount and title entered by a person must never be overwritten by AI.
  lockDealFields(id, {
    value: body.value !== undefined ? true : undefined,
    stage: body.stageId !== undefined ? true : undefined,
    title: body.title !== undefined ? true : undefined,
  });

  if (body.stageId !== undefined && stage && String(existing.stageId) !== String(stage.id)) {
    annotateLatestStageHistory(id, {
      reason: stage.isLost ? String(body.lossReason || "").trim() : `Перевод в «${stage.name}»`,
      changedBy: actor.id,
    });
    try { await pushDealStageToStorefront(id, stage.name); }
    catch (error) { console.error("Storefront fulfillment sync failed", error); }
  }

  writeAuditLog(actor, "update_deal", "deal", id, {
    title: body.title !== undefined ? body.title : undefined,
    value: body.value !== undefined ? body.value : undefined,
    receivedAmount: body.receivedAmount !== undefined ? body.receivedAmount : undefined,
    stageId: body.stageId !== undefined ? body.stageId : undefined,
    ownerId: body.ownerId !== undefined ? body.ownerId : undefined,
    lossReason: body.lossReason !== undefined ? body.lossReason : undefined,
  });
  return NextResponse.json({ ...result, economics: getDealEconomics(id) });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = db.select().from(deals).where(eq(deals.id, id)).get();
  if (!existing) return NextResponse.json({ error: "Сделка не найдена" }, { status: 404 });
  const actor = getRequestActor(request);
  db.delete(deals).where(eq(deals.id, id)).run();
  writeAuditLog(actor, "delete_deal", "deal", id, { title: existing.title });
  return NextResponse.json({ success: true });
}
