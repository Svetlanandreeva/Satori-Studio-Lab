import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals, contacts, pipelineStages } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { buildEmailConversationIndex } from "@/lib/email-conversation";
import { deduplicateDeals, isDuplicateDealPair } from "@/lib/deal-dedup";
import { SPAM_STAGE_NAME } from "@/lib/lead-qualification";
import { deleteDealsCascade } from "@/lib/safe-delete";
import { getRequestActor } from "@/lib/request-actor";
import { writeAuditLog } from "@/lib/operations";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const includeSandbox = url.searchParams.get("includeSandbox") === "1";
  const includeDuplicates = url.searchParams.get("includeDuplicates") === "1";

  const rawResults = db
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
      contactSource: contacts.source,
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
    .filter((deal) => includeSandbox || deal.stageName !== SPAM_STAGE_NAME)
    .filter((deal) => deal.contactSource !== "need_number" || deal.contactQualification === "qualified");

  if (includeDuplicates) return NextResponse.json(rawResults);
  return NextResponse.json(deduplicateDeals(rawResults));
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
  const value = Number(body.value) || 0;
  if (!title || !contactId) {
    return NextResponse.json({ error: "Укажите название сделки и клиента" }, { status: 400 });
  }

  const contact = db.select().from(contacts).where(eq(contacts.id, contactId)).get();
  if (!contact) {
    return NextResponse.json({ error: "Клиент не найден" }, { status: 400 });
  }

  const now = new Date();
  const notes = body.notes ? String(body.notes) : null;
  const emailIndex = buildEmailConversationIndex();
  const contactSourceById = new Map(db.select({ id: contacts.id, source: contacts.source }).from(contacts).all().map((row) => [row.id, row.source]));
  // Ручное создание из интерфейса никогда не блокируется «похожестью» на старую сделку.
  const existingDeal = body.manual === true ? undefined : db
    .select()
    .from(deals)
    .all()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .find((deal) =>
      isDuplicateDealPair(
        { contactId, contactSource: contact.source, title, value, createdAt: now, notes },
        {
          contactId: deal.contactId,
          contactSource: contactSourceById.get(deal.contactId),
          title: deal.title,
          value: deal.value,
          createdAt: deal.createdAt,
          updatedAt: deal.updatedAt,
          notes: deal.notes,
        },
        emailIndex
      )
    );

  if (existingDeal) {
    return NextResponse.json(
      {
        ...existingDeal,
        duplicate: true,
        message: "Эта сделка уже существует — повтор не создан",
      },
      { status: 200 }
    );
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
    const result = db
      .insert(deals)
      .values({
        title,
        value,
        stageId: finalStageId,
        contactId,
        expectedClose: body.expectedClose ? new Date(String(body.expectedClose)) : null,
        probability: Math.max(0, Math.min(100, Number(body.probability) || 0)),
        notes,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    if (contact.source === "need_number" && contact.qualification !== "qualified") {
      db.update(contacts)
        .set({ qualification: "qualified", updatedAt: now })
        .where(eq(contacts.id, contactId))
        .run();
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown";
    if (message.includes("FOREIGN KEY")) {
      return NextResponse.json({ error: "Клиент не найден" }, { status: 400 });
    }
    return NextResponse.json({ error: `Не удалось создать сделку: ${message}` }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let body: { ids?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 }); }
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 500) : [];
  if (!ids.length) return NextResponse.json({ error: "Не выбраны сделки" }, { status: 400 });
  try {
    const removed = deleteDealsCascade(ids);
    writeAuditLog(getRequestActor(request), "bulk_delete_deals", "deal", null, { ids, removed });
    return NextResponse.json({ success: true, removed });
  } catch (error) {
    console.error("Bulk deal delete failed", error);
    return NextResponse.json({ error: "Не удалось удалить сделки" }, { status: 500 });
  }
}
