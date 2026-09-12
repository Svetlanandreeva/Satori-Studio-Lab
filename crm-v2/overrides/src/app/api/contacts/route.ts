import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, deals, pipelineStages, teamMembers } from "@/db/schema";
import { desc } from "drizzle-orm";
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
  const search = (searchParams.get("search") || "").trim().toLowerCase();
  const temperature = searchParams.get("temperature");
  const source = searchParams.get("source");
  const qualification = searchParams.get("qualification");
  const includeSpam = searchParams.get("includeSpam") === "1";

  const contactRows = db.select().from(contacts).orderBy(desc(contacts.createdAt)).all();
  const stageMap = new Map(db.select().from(pipelineStages).all().map((stage) => [stage.id, stage]));
  const ownerMap = new Map(db.select().from(teamMembers).all().map((member) => [member.id, member]));
  const dealRows = db.select().from(deals).all().sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const dealByContact = new Map<string, (typeof dealRows)[number]>();
  for (const deal of dealRows) {
    const current = dealByContact.get(deal.contactId);
    const stage = stageMap.get(deal.stageId);
    if (!current) { dealByContact.set(deal.contactId, deal); continue; }
    const currentStage = stageMap.get(current.stageId);
    const currentClosed = Boolean(currentStage?.isWon || currentStage?.isLost);
    const nextClosed = Boolean(stage?.isWon || stage?.isLost);
    if (currentClosed && !nextClosed) dealByContact.set(deal.contactId, deal);
  }

  const results = contactRows
    .filter((contact) => {
      if (!includeSpam && (contact.qualification === "spam" || contact.qualification === "ignore")) return false;
      const matchesSearch = !search || contact.name.toLowerCase().includes(search) || contact.email?.toLowerCase().includes(search) || contact.company?.toLowerCase().includes(search) || contact.phone?.toLowerCase().includes(search);
      const matchesTemperature = !temperature || contact.temperature === temperature;
      const matchesSource = !source || contact.source === source;
      const matchesQualification = !qualification || !isLeadQualification(qualification) || contact.qualification === qualification;
      return Boolean(matchesSearch && matchesTemperature && matchesSource && matchesQualification);
    })
    .map((contact) => {
      const deal = dealByContact.get(contact.id) || null;
      const stage = deal ? stageMap.get(deal.stageId) : null;
      const owner = deal?.ownerId ? ownerMap.get(deal.ownerId) : null;
      return {
        ...contact,
        activeDealId: deal?.id || null,
        activeDealTitle: deal?.title || null,
        activeDealValue: deal?.value || 0,
        stageId: stage?.id || null,
        stageName: stage?.name || null,
        stageIsWon: Boolean(stage?.isWon),
        stageIsLost: Boolean(stage?.isLost),
        ownerId: deal?.ownerId || null,
        ownerName: owner?.name || null,
      };
    });
  return NextResponse.json(results);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 }); }

  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Укажите имя" }, { status: 400 });
  const phone = body.phone ? String(body.phone).trim() : null;
  const email = body.email ? String(body.email).trim() : null;
  const phoneKey = phoneIdentity(phone);
  const emailKey = emailIdentity(email);
  const duplicate = db.select().from(contacts).all().find((item) => Boolean((phoneKey && phoneIdentity(item.phone) === phoneKey) || (emailKey && emailIdentity(item.email) === emailKey)));
  if (duplicate) return NextResponse.json({ ...duplicate, duplicate: true, message: "Клиент с таким телефоном или email уже существует" }, { status: 200 });

  try {
    const now = new Date();
    const qualificationValue = isLeadQualification(body.qualification) ? body.qualification : "new";
    const result = db.insert(contacts).values({
      name, email, phone,
      company: body.company ? String(body.company).trim() : null,
      source: body.source ? String(body.source) : "otro",
      temperature: body.temperature ? String(body.temperature) : "cold",
      qualification: qualificationValue,
      score: Math.max(0, Math.min(100, Number(body.score) || 0)),
      notes: body.notes ? String(body.notes) : null,
      createdAt: now, updatedAt: now,
    }).returning().get();
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: `Не удалось создать клиента: ${error instanceof Error ? error.message : "unknown"}` }, { status: 500 });
  }
}
