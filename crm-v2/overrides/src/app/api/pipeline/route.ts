import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pipelineStages, deals, contacts, teamMembers, dealStageHistory } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { SANDBOX_QUALIFICATIONS, SPAM_STAGE_NAME, type LeadQualification } from "@/lib/lead-qualification";
import { markDealReachedCalculation } from "@/lib/deal-flow";
import { DELIVERY_STAGE_NAME, COMPLETED_STAGE_NAME, runCrmConsistencyRepair } from "@/lib/crm-consistency";
import { startShipment, markShipmentDelivered } from "@/lib/shipment";
import { annotateLatestStageHistory, writeAuditLog } from "@/lib/operations";
import { getRequestActor } from "@/lib/request-actor";
import { deduplicateDeals } from "@/lib/deal-dedup";

// Эти этапы использует синхронизация с магазином и почтой — их можно двигать и перекрашивать, но не переименовывать и не удалять.
const PROTECTED_STAGE_NAMES = new Set([DELIVERY_STAGE_NAME, COMPLETED_STAGE_NAME, "Отказ", SPAM_STAGE_NAME, "Новый запрос", "Согласовано", "В производстве", "Готово"]);
const safeColor = (value: unknown) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : "#64748b";

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

function visibleStages() {
  return db.select().from(pipelineStages).orderBy(asc(pipelineStages.order)).all().filter((stage) => stage.name !== SPAM_STAGE_NAME);
}

function normalizeVisibleOrders() {
  visibleStages().forEach((stage, index) => {
    if (stage.order !== index) db.update(pipelineStages).set({ order: index }).where(eq(pipelineStages.id, stage.id)).run();
  });
}

export async function GET() {
  runCrmConsistencyRepair();
  migrateExistingSandboxContacts();
  const stages = visibleStages();
  const visibleStageIds = new Set(stages.map((stage) => stage.id));
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));

  const rawDeals = db
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
      contactSource: contacts.source,
      ownerName: teamMembers.name,
    })
    .from(deals)
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(teamMembers, eq(deals.ownerId, teamMembers.id))
    .all()
    .filter((deal) => visibleStageIds.has(deal.stageId))
    .filter((deal) => deal.contactSource !== "need_number" || deal.contactQualification === "qualified")
    .map((deal) => {
      const stage = stageById.get(deal.stageId);
      return { ...deal, stageIsWon: Boolean(stage?.isWon), stageIsLost: Boolean(stage?.isLost) };
    });

  const visibleDeals = deduplicateDeals(rawDeals);
  return NextResponse.json(stages.map((stage) => ({
    ...stage,
    deals: visibleDeals.filter((deal) => deal.stageId === stage.id),
  })));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Укажите название этапа" }, { status: 400 });
    if (name === SPAM_STAGE_NAME) return NextResponse.json({ error: "Это служебное название" }, { status: 400 });
    const existing = db.select().from(pipelineStages).all().find(s => s.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) return NextResponse.json({ error: "Этап с таким названием уже существует" }, { status: 409 });
    const rows = visibleStages();
    const order = rows.length ? Math.max(...rows.map(s => s.order)) + 1 : 0;
    const created = db.insert(pipelineStages).values({
      id: crypto.randomUUID(), name, order, color: safeColor(body.color), isWon: false, isLost: false,
    }).returning().get();
    normalizeVisibleOrders();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось добавить этап" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const stageId = String(body.stageId || "").trim();
    if (!stageId) return NextResponse.json({ error: "Не указан этап" }, { status: 400 });
    const stage = db.select().from(pipelineStages).where(eq(pipelineStages.id, stageId)).get();
    if (!stage || stage.name === SPAM_STAGE_NAME) return NextResponse.json({ error: "Этап не найден" }, { status: 404 });

    const updates: Partial<typeof pipelineStages.$inferInsert> = {};
    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "Название не может быть пустым" }, { status: 400 });
      if (PROTECTED_STAGE_NAMES.has(stage.name) && name !== stage.name) return NextResponse.json({ error: "Системный этап нельзя переименовать" }, { status: 400 });
      const duplicate = db.select().from(pipelineStages).all().find(s => s.id !== stage.id && s.name.trim().toLowerCase() === name.toLowerCase());
      if (duplicate) return NextResponse.json({ error: "Этап с таким названием уже существует" }, { status: 409 });
      updates.name = name;
    }
    if (body.color !== undefined) updates.color = safeColor(body.color);
    if (body.order !== undefined && Number.isFinite(Number(body.order))) updates.order = Math.max(0, Math.round(Number(body.order)));
    const result = db.update(pipelineStages).set(updates).where(eq(pipelineStages.id, stage.id)).returning().get();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось сохранить этап" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const stageId = new URL(request.url).searchParams.get("stageId") || "";
  const stage = db.select().from(pipelineStages).where(eq(pipelineStages.id, stageId)).get();
  if (!stage || stage.name === SPAM_STAGE_NAME) return NextResponse.json({ error: "Этап не найден" }, { status: 404 });
  if (stage.isWon || stage.isLost || PROTECTED_STAGE_NAMES.has(stage.name)) return NextResponse.json({ error: "Системный этап нельзя удалить" }, { status: 400 });
  const hasDeals = Boolean(db.select({ id: deals.id }).from(deals).where(eq(deals.stageId, stage.id)).get());
  if (hasDeals) return NextResponse.json({ error: "Сначала перенесите сделки с этого этапа" }, { status: 409 });
  const usedInHistory = Boolean(db.select({ id: dealStageHistory.id, fromStageId: dealStageHistory.fromStageId, toStageId: dealStageHistory.toStageId }).from(dealStageHistory).all().find(row => row.fromStageId === stage.id || row.toStageId === stage.id));
  if (usedInHistory) return NextResponse.json({ error: "Этап уже использовался в истории сделок. Его можно переименовать, но нельзя удалить." }, { status: 409 });
  db.delete(pipelineStages).where(eq(pipelineStages.id, stage.id)).run();
  normalizeVisibleOrders();
  return NextResponse.json({ success: true });
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
    if (targetStage.name === DELIVERY_STAGE_NAME && !trackingCode) return NextResponse.json({ error: "Перед переводом в доставку укажите трек-номер / код отправления" }, { status: 400 });
    const lossReason = String(body.lossReason || "").trim();
    if (targetStage.isLost && !lossReason) return NextResponse.json({ error: "Укажите причину отказа" }, { status: 400 });

    const actor = getRequestActor(request);
    const result = db.update(deals).set({ stageId: targetStage.id, lossReason: targetStage.isLost ? lossReason : null, updatedAt: new Date() }).where(eq(deals.id, existing.id)).returning().get();
    annotateLatestStageHistory(existing.id, { reason: targetStage.isLost ? lossReason : `Перевод в «${targetStage.name}»`, changedBy: actor.id });
    writeAuditLog(actor, "move_deal", "deal", existing.id, { fromStageId: existing.stageId, toStageId: targetStage.id, toStage: targetStage.name, lossReason: targetStage.isLost ? lossReason : null });
    markDealReachedCalculation(existing.id, targetStage.id);
    let shipment: Awaited<ReturnType<typeof startShipment>> | null = null;
    if (targetStage.name === DELIVERY_STAGE_NAME) shipment = await startShipment(existing.id, trackingCode);
    else if (targetStage.name === COMPLETED_STAGE_NAME) markShipmentDelivered(existing.id);
    runCrmConsistencyRepair();
    return NextResponse.json({ ...result, shipment });
  }

  if (body.stages && Array.isArray(body.stages)) return NextResponse.json({ error: "Этапы основной воронки нельзя массово заменять при работающей CRM" }, { status: 400 });
  return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
}
