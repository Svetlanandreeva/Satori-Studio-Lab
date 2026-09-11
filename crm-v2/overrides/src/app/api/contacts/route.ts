import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { eq, like, or, desc, and } from "drizzle-orm";
import { isLeadQualification } from "@/lib/lead-qualification";

function phoneIdentity(value: unknown): string | null {
  if (!value) return null;
  let digits = String(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits.length >= 10 ? digits : null;
}

function emailIdentity(value: unknown): string | null {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const temperature = searchParams.get("temperature");
  const source = searchParams.get("source");
  const qualification = searchParams.get("qualification");

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(contacts.name, `%${search}%`),
        like(contacts.email, `%${search}%`),
        like(contacts.company, `%${search}%`),
        like(contacts.phone, `%${search}%`)
      )
    );
  }
  if (temperature) conditions.push(eq(contacts.temperature, temperature));
  if (source) conditions.push(eq(contacts.source, source));
  if (qualification && isLeadQualification(qualification)) {
    conditions.push(eq(contacts.qualification, qualification));
  }

  let query = db.select().from(contacts);
  if (conditions.length === 1) query = query.where(conditions[0]) as typeof query;
  if (conditions.length > 1) query = query.where(and(...conditions)) as typeof query;

  const results = query.orderBy(desc(contacts.createdAt)).all();
  return NextResponse.json(results);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Укажите имя" }, { status: 400 });
  }

  const phone = body.phone ? String(body.phone).trim() : null;
  const email = body.email ? String(body.email).trim() : null;
  const phoneKey = phoneIdentity(phone);
  const emailKey = emailIdentity(email);

  const duplicate = db
    .select()
    .from(contacts)
    .all()
    .find((item) => {
      const samePhone = phoneKey && phoneIdentity(item.phone) === phoneKey;
      const sameEmail = emailKey && emailIdentity(item.email) === emailKey;
      return Boolean(samePhone || sameEmail);
    });

  if (duplicate) {
    return NextResponse.json(
      {
        ...duplicate,
        duplicate: true,
        message: "Клиент с таким телефоном или email уже существует",
      },
      { status: 200 }
    );
  }

  try {
    const now = new Date();
    const qualification = isLeadQualification(body.qualification)
      ? body.qualification
      : "new";
    const result = db
      .insert(contacts)
      .values({
        name,
        email,
        phone,
        company: body.company ? String(body.company).trim() : null,
        source: body.source ? String(body.source) : "otro",
        temperature: body.temperature ? String(body.temperature) : "cold",
        qualification,
        score: Math.max(0, Math.min(100, Number(body.score) || 0)),
        notes: body.notes ? String(body.notes) : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: `Не удалось создать клиента: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 500 }
    );
  }
}
