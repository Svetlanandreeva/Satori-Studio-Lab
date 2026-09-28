import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contactId");
  const dealId = searchParams.get("dealId");

  let query = db
    .select({
      id: activities.id,
      type: activities.type,
      description: activities.description,
      contactId: activities.contactId,
      dealId: activities.dealId,
      scheduledAt: activities.scheduledAt,
      completedAt: activities.completedAt,
      createdAt: activities.createdAt,
      contactName: contacts.name,
      contactQualification: contacts.qualification,
    })
    .from(activities)
    .leftJoin(contacts, eq(activities.contactId, contacts.id));

  if (contactId) {
    query = query.where(eq(activities.contactId, contactId)) as typeof query;
  }

  if (dealId) {
    query = query.where(eq(activities.dealId, dealId)) as typeof query;
  }

  let results = query.orderBy(desc(activities.createdAt)).all();
  if (!contactId && !dealId) {
    results = results.filter((activity) => activity.contactQualification !== "spam");
  }

  return NextResponse.json(results);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const type = String(body.type || "").trim();
  const description = String(body.description || "").trim();
  const contactId = String(body.contactId || "").trim();
  if (!type || !description || !contactId) {
    return NextResponse.json(
      { error: "Укажите тип, описание и клиента" },
      { status: 400 }
    );
  }

  try {
    const result = db
      .insert(activities)
      .values({
        type,
        description,
        contactId,
        dealId: body.dealId ? String(body.dealId) : null,
        scheduledAt: body.scheduledAt ? new Date(String(body.scheduledAt)) : null,
        completedAt: null,
        createdAt: new Date(),
      })
      .returning()
      .get();

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: `Не удалось создать активность: ${error instanceof Error ? error.message : "Unknown"}` },
      { status: 500 }
    );
  }
}
