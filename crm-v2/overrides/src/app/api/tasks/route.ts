import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, contacts, deals, teamMembers } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getRequestActor } from "@/lib/request-actor";
import { writeAuditLog } from "@/lib/operations";

export const dynamic = "force-dynamic";

export async function GET() {
  const tasks = db.select({
    id: activities.id,
    type: activities.type,
    description: activities.description,
    contactId: activities.contactId,
    dealId: activities.dealId,
    ownerId: activities.ownerId,
    priority: activities.priority,
    scheduledAt: activities.scheduledAt,
    completedAt: activities.completedAt,
    createdAt: activities.createdAt,
    contactName: contacts.name,
    dealTitle: deals.title,
    ownerName: teamMembers.name,
  }).from(activities)
    .leftJoin(contacts, eq(activities.contactId, contacts.id))
    .leftJoin(deals, eq(activities.dealId, deals.id))
    .leftJoin(teamMembers, eq(activities.ownerId, teamMembers.id))
    .orderBy(desc(activities.scheduledAt))
    .all()
    .filter((item) => item.scheduledAt || item.type === "task");
  return NextResponse.json({ tasks });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const description = String(body.description || "").trim();
    const contactId = String(body.contactId || "").trim();
    if (!description || !contactId) return NextResponse.json({ error: "Укажите задачу и клиента" }, { status: 400 });
    const contact = db.select().from(contacts).where(eq(contacts.id, contactId)).get();
    if (!contact) return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
    const scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : new Date();
    if (Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "Некорректная дата" }, { status: 400 });
    const priority = ["low", "normal", "high", "urgent"].includes(String(body.priority)) ? String(body.priority) : "normal";
    const ownerId = String(body.ownerId || "").trim() || null;
    const actor = getRequestActor(request);
    const result = db.insert(activities).values({
      id: crypto.randomUUID(), type: "task", description, contactId,
      dealId: body.dealId ? String(body.dealId) : null,
      ownerId: ownerId || actor.id,
      priority,
      scheduledAt,
      completedAt: null,
      createdAt: new Date(),
    }).returning().get();
    writeAuditLog(actor, "create_task", "activity", result.id, { description, contactId, scheduledAt: scheduledAt.toISOString(), priority, ownerId: ownerId || actor.id });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось создать задачу" }, { status: 400 });
  }
}
