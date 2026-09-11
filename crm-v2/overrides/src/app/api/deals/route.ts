import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals, contacts, pipelineStages } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { SPAM_STAGE_NAME } from "@/lib/lead-qualification";

export async function GET(request: NextRequest) {
  const includeSandbox = new URL(request.url).searchParams.get("includeSandbox") === "1";

  const results = db
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
      contactEmail: contacts.email,
      contactTemperature: contacts.temperature,
      contactQualification: contacts.qualification,
      stageName: pipelineStages.name,
      stageColor: pipelineStages.color,
      stageOrder: pipelineStages.order,
      stageIsWon: pipelineStages.isWon,
      stageIsLost: pipelineStages.isLost,
    })
    .from(deals)
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .orderBy(desc(deals.createdAt))
    .all()
    .filter((deal) => includeSandbox || deal.stageName !== SPAM_STAGE_NAME);

  return NextResponse.json(results);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const title = String(body.title || "").trim();
  const contactId = String(body.contactId || "").trim();
  if (!title || !contactId) {
    return NextResponse.json({ error: "Укажите название сделки и клиента" }, { status: 400 });
  }

  let finalStageId = body.stageId ? String(body.stageId) : "";
  if (!finalStageId) {
    const firstStage = db
      .select()
      .from(pipelineStages)
      .all()
      .filter((stage) => stage.name !== SPAM_STAGE_NAME && !stage.isWon && !stage.isLost)
      .sort((a, b) => a.order - b.order)[0];
    finalStageId = firstStage?.id || "";
  }

  if (!finalStageId) {
    return NextResponse.json({ error: "Нет доступных этапов воронки" }, { status: 400 });
  }

  try {
    const now = new Date();
    const result = db
      .insert(deals)
      .values({
        title,
        value: Number(body.value) || 0,
        stageId: finalStageId,
        contactId,
        expectedClose: body.expectedClose ? new Date(String(body.expectedClose)) : null,
        probability: Math.max(0, Math.min(100, Number(body.probability) || 0)),
        notes: body.notes ? String(body.notes) : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown";
    if (message.includes("FOREIGN KEY")) {
      return NextResponse.json({ error: "Клиент не найден" }, { status: 400 });
    }
    return NextResponse.json({ error: `Не удалось создать сделку: ${message}` }, { status: 500 });
  }
}
