import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pipelineStages, deals, contacts } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { SPAM_STAGE_NAME } from "@/lib/lead-qualification";

function migrateExistingSpam() {
  const stages = db.select().from(pipelineStages).all();
  const sandbox = stages.find((stage) => stage.name === SPAM_STAGE_NAME);
  if (!sandbox) return;

  const spamContactIds = new Set(
    db
      .select()
      .from(contacts)
      .all()
      .filter((contact) => contact.qualification === "spam")
      .map((contact) => contact.id)
  );
  if (spamContactIds.size === 0) return;

  const currentDeals = db.select().from(deals).all();
  for (const deal of currentDeals) {
    if (!spamContactIds.has(deal.contactId)) continue;
    const currentStage = stages.find((stage) => stage.id === deal.stageId);
    if (currentStage?.isWon || deal.stageId === sandbox.id) continue;
    db.update(deals)
      .set({ stageId: sandbox.id, probability: 0, updatedAt: new Date() })
      .where(eq(deals.id, deal.id))
      .run();
  }
}

export async function GET() {
  migrateExistingSpam();

  const stages = db
    .select()
    .from(pipelineStages)
    .orderBy(asc(pipelineStages.order))
    .all()
    .filter((stage) => stage.name !== SPAM_STAGE_NAME);

  const allDeals = db
    .select({
      id: deals.id,
      title: deals.title,
      value: deals.value,
      stageId: deals.stageId,
      contactId: deals.contactId,
      expectedClose: deals.expectedClose,
      probability: deals.probability,
      notes: deals.notes,
      createdAt: deals.createdAt,
      updatedAt: deals.updatedAt,
      contactName: contacts.name,
      contactTemperature: contacts.temperature,
      contactQualification: contacts.qualification,
    })
    .from(deals)
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .all();

  const visibleStageIds = new Set(stages.map((stage) => stage.id));
  const pipeline = stages.map((stage) => ({
    ...stage,
    deals: allDeals.filter(
      (deal) => deal.stageId === stage.id && visibleStageIds.has(deal.stageId)
    ),
  }));

  return NextResponse.json(pipeline);
}

export async function PUT(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (body.dealId && body.stageId) {
    const existing = db
      .select()
      .from(deals)
      .where(eq(deals.id, String(body.dealId)))
      .get();
    if (!existing) {
      return NextResponse.json({ error: "Сделка не найдена" }, { status: 404 });
    }

    const targetStage = db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.id, String(body.stageId)))
      .get();
    if (!targetStage || targetStage.name === SPAM_STAGE_NAME) {
      return NextResponse.json({ error: "Недоступный этап воронки" }, { status: 400 });
    }

    const result = db
      .update(deals)
      .set({ stageId: targetStage.id, updatedAt: new Date() })
      .where(eq(deals.id, existing.id))
      .returning()
      .get();

    return NextResponse.json(result);
  }

  if (body.stages && Array.isArray(body.stages)) {
    return NextResponse.json(
      { error: "Этапы основной воронки нельзя массово заменять при работающей CRM" },
      { status: 400 }
    );
  }

  return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
}
