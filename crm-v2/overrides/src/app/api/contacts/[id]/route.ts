import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, deals, activities, pipelineStages } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  CLOSED_QUALIFICATIONS,
  LEAD_QUALIFICATION_LABELS,
  isLeadQualification,
} from "@/lib/lead-qualification";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const contact = db.select().from(contacts).where(eq(contacts.id, id)).get();
  if (!contact) {
    return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  }

  const contactDeals = db.select().from(deals).where(eq(deals.contactId, id)).all();
  const contactActivities = db
    .select()
    .from(activities)
    .where(eq(activities.contactId, id))
    .all();

  return NextResponse.json({ ...contact, deals: contactDeals, activities: contactActivities });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const existing = db.select().from(contacts).where(eq(contacts.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updateData.name = String(body.name || "").trim();
  if (body.email !== undefined) updateData.email = body.email ? String(body.email).trim() : null;
  if (body.phone !== undefined) updateData.phone = body.phone ? String(body.phone).trim() : null;
  if (body.company !== undefined) updateData.company = body.company ? String(body.company).trim() : null;
  if (body.source !== undefined) updateData.source = String(body.source);
  if (body.temperature !== undefined) updateData.temperature = String(body.temperature);
  if (body.score !== undefined) {
    updateData.score = Math.max(0, Math.min(100, Number(body.score) || 0));
  }
  if (body.notes !== undefined) updateData.notes = body.notes ? String(body.notes) : null;

  let qualificationChanged = false;
  let qualification: typeof existing.qualification | null = null;
  if (body.qualification !== undefined) {
    if (!isLeadQualification(body.qualification)) {
      return NextResponse.json({ error: "Неизвестный статус квалификации" }, { status: 400 });
    }
    qualification = body.qualification;
    updateData.qualification = qualification;
    qualificationChanged = qualification !== existing.qualification;
  }

  const result = db
    .update(contacts)
    .set(updateData)
    .where(eq(contacts.id, id))
    .returning()
    .get();

  if (qualificationChanged && qualification) {
    db.insert(activities)
      .values({
        type: "note",
        description: `Квалификация: ${LEAD_QUALIFICATION_LABELS[qualification]}`,
        contactId: id,
        createdAt: new Date(),
      })
      .run();

    if (CLOSED_QUALIFICATIONS.has(qualification)) {
      const lostStage = db
        .select()
        .from(pipelineStages)
        .all()
        .find((stage) => stage.isLost);
      if (lostStage) {
        const currentDeals = db.select().from(deals).where(eq(deals.contactId, id)).all();
        for (const deal of currentDeals) {
          const stage = db
            .select()
            .from(pipelineStages)
            .where(eq(pipelineStages.id, deal.stageId))
            .get();
          if (!stage?.isWon && !stage?.isLost) {
            db.update(deals)
              .set({ stageId: lostStage.id, probability: 0, updatedAt: new Date() })
              .where(eq(deals.id, deal.id))
              .run();
          }
        }
      }
    }
  }

  return NextResponse.json(result);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const existing = db.select().from(contacts).where(eq(contacts.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  }

  const contactDeals = db.select().from(deals).where(eq(deals.contactId, id)).all();
  const contactActivities = db.select().from(activities).where(eq(activities.contactId, id)).all();

  const transaction = db.transaction(() => {
    for (const activity of contactActivities) {
      db.delete(activities).where(eq(activities.id, activity.id)).run();
    }
    for (const deal of contactDeals) {
      db.delete(deals).where(eq(deals.id, deal.id)).run();
    }
    db.delete(contacts).where(eq(contacts.id, id)).run();
  });
  transaction();

  return NextResponse.json({ success: true });
}
