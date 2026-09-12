import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pipelineStages, deals, contacts, teamMembers } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { SANDBOX_QUALIFICATIONS, SPAM_STAGE_NAME, type LeadQualification } from "@/lib/lead-qualification";
import { markDealReachedCalculation } from "@/lib/deal-flow";
import { DELIVERY_STAGE_NAME, COMPLETED_STAGE_NAME, runCrmConsistencyRepair } from "@/lib/crm-consistency";
import { startShipment, markShipmentDelivered } from "@/lib/shipment";
import { annotateLatestStageHistory, writeAuditLog } from "@/lib/operations";
import { getRequestActor } from "@/lib/request-actor";

function migrateExistingSandboxContacts() {
  const stages = db.select().from(pipelineStages).all();
  const sandbox = stages.find((stage) => stage.name === SPAM_STAGE_NAME);
  if (!sandbox) return;
  const sandboxContactIds = new Set(
    db.select().from(contacts).all()
      .filter((contact) => SANDBOX_QUALIFICATIONS.has((contact.qualification || "new") as LeadQualification))
      .map((contact) => contact.id)
  );
  if (!sandboxContactIds.size) return;
  for (const deal of db.select().from(deals).all()) {
    if (!sandboxContactIds.has(deal.contactId)) continue;
    const currentStage = stages.find((stage) => stage.id === deal.stageId);
    if (currentStage?.isWon || deal.stageId === sandbox.id) continue;
    db.update(deals).set({ stageId: sandbox.id, probability: 0, updatedAt: new Date() }).where(eq(deals.id, deal.id)).run();
  }
}

export async function GET() {
  runCrmConsistencyRepair();
  migrateExistingSandboxContacts();
  const stages = db.select().from(pipelineStages).orderBy(asc(pipelineStages.order)).all().filter((stage) => stage.name !== SPAM_STAGE_NAME);
  const allDeals = db
    .select({
      id: deals.id,
      title: deals.title,
      value: deals.value,
      stageId: deals.stageId,
      contactId: deals.contactId,
      ownerId: deals.ownerId,
      lossReason: deals.lossReason,
      expectedClose: deals.expectedClose,
      probability: deals.probability,
      notes: deals.notes,
      createdAt: deals.createdAt,
      updatedAt: deals.updatedAt,
      contactName: contacts.name,
      contactTemperature: contacts.temperature,
      contactQualification: contacts.qualification,
      ownerName: teamMembers.name,
    })
    .from(deals)
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(teamMembers, eq(deals.ownerId, teamMembers.id))
    .all();
  const visibleStageIds = new Set(stages.map((stage) => stage.id));
  return NextResponse.json(stages.map((stage) => ({
    ...stage,
    deals: allDeals.filter((deal) => deal.stageId === stage.id && visibleStageIds.has(deal.stageId)),
  })));
}

export async function PUT(request: NextRequest) {
  runCrmConsistencyRepair();
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 }); }

  if (body.dealId && body.stageId) {
    const existing = db.select().from(deals).where(eq(deals.id, String(body.dealId))).get();
    if (!existing) return NextResponse.json({ error: "Сделка не найдена" }, { status: 404 });
    const targetStage = db.select().from(pipelineStages).where(eq(pipelineStages.id, String(body.stageId))).get();
    if (!targetStage || targetStage.name === SPAM_STAGE_NAME) return NextResponse.json({ error: "Недоступный этап воронки" }, { status: 400 });

    const trackingCode = String(body.trackingCode || "").trim();
    if (targetStage.name === DELIVERY_STAGE_NAME && !trackingCode) {
      return NextResponse.json({ error: "Перед переводом в доставку укажите трек-номер / код отправления" }, { status: 400 });
    }

    const lossReason = String(body.lossReason || "").trim();
    if (targetStage.isLost && !lossReason) {
      return NextResponse.json({ error: "Укажите причину отказа" }, { status: 400 });
    }

    const actor = getRequestActor(request);
    const result = db.update(deals).set({
      stageId: targetStage.id,
      lossReason: targetStage.isLost ? lossReason : null,
      updatedAt: new Date(),
    }).where(eq(deals.id, existing.id)).returning().get();

    annotateLatestStageHistory(existing.id, {
      reason: targetStage.isLost ? lossReason : `Перевод в «${targetStage.name}»`,
      changedBy: actor.id,
    });
    writeAuditLog(actor, "move_deal", "deal", existing.id, {
      fromStageId: existing.stageId,
      toStageId: targetStage.id,
      toStage: targetStage.name,
      lossReason: targetStage.isLost ? lossReason : null,
    });

    markDealReachedCalculation(existing.id, targetStage.id);
    let shipment: Awaited<ReturnType<typeof startShipment>> | null = null;
    if (targetStage.name === DELIVERY_STAGE_NAME) shipment = await startShipment(existing.id, trackingCode);
    else if (targetStage.name === COMPLETED_STAGE_NAME) markShipmentDelivered(existing.id);

    runCrmConsistencyRepair();
    return NextResponse.json({ ...result, shipment });
  }

  if (body.stages && Array.isArray(body.stages)) {
    return NextResponse.json({ error: "Этапы основной воронки нельзя массово заменять при работающей CRM" }, { status: 400 });
  }
  return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
}
