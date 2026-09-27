import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals, contacts, pipelineStages } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  buildEmailConversationIndex,
  sameEmailConversationForDeals,
  type EmailConversationIndex,
} from "@/lib/email-conversation";
import { SPAM_STAGE_NAME } from "@/lib/lead-qualification";

const DAY = 24 * 60 * 60 * 1000;
const EXACT_DUPLICATE_WINDOW = 30 * DAY;
const SIMILAR_DUPLICATE_WINDOW = 3 * DAY;
const SIMILARITY_THRESHOLD = 0.6;
const TITLE_STOP_WORDS = new Set([
  "и", "в", "во", "на", "по", "под", "для", "из", "с", "со", "к", "до", "от", "за", "шт", "штук",
  "заказ", "заявка", "проект", "изготовление",
]);

function normalizeTitle(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function titleTokens(value: unknown): Set<string> {
  return new Set(
    normalizeTitle(value)
      .split(" ")
      .filter((token) => token.length > 2 && !TITLE_STOP_WORDS.has(token))
  );
}

function titleSimilarity(a: unknown, b: unknown): number {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function dateMs(value: unknown): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isDuplicatePair(
  a: { contactId: string; title: string; value: number; createdAt: unknown; notes?: unknown },
  b: { contactId: string; title: string; value: number; createdAt: unknown; notes?: unknown },
  emailIndex: EmailConversationIndex
): boolean {
  // One RFC email conversation is one opportunity even when several employees of
  // the same customer wrote from different addresses. The legacy importer split
  // those participants into separate contacts, so the fallback index also links
  // old records that do not yet have [email-thread:*] in deal notes.
  if (sameEmailConversationForDeals(a, b, emailIndex)) return true;

  if (!a.contactId || a.contactId !== b.contactId) return false;

  const age = Math.abs(dateMs(a.createdAt) - dateMs(b.createdAt));
  const aTitle = normalizeTitle(a.title);
  const bTitle = normalizeTitle(b.title);
  const sameValue = Number(a.value || 0) === Number(b.value || 0);

  if (sameValue && aTitle && aTitle === bTitle && age <= EXACT_DUPLICATE_WINDOW) return true;

  return sameValue && age <= SIMILAR_DUPLICATE_WINDOW && titleSimilarity(a.title, b.title) >= SIMILARITY_THRESHOLD;
}

function stageRank(deal: { stageIsWon?: boolean | null; stageIsLost?: boolean | null }): number {
  if (deal.stageIsWon) return 3;
  if (deal.stageIsLost) return 1;
  return 2;
}

function preferCandidate(
  candidate: { stageIsWon?: boolean | null; stageIsLost?: boolean | null; value?: number | null; updatedAt: unknown },
  saved: { stageIsWon?: boolean | null; stageIsLost?: boolean | null; value?: number | null; updatedAt: unknown }
): boolean {
  const candidateStage = stageRank(candidate);
  const savedStage = stageRank(saved);
  if (candidateStage !== savedStage) return candidateStage > savedStage;

  // Historical email doubles often contain one populated amount and one zero-value
  // technical copy. Keep the meaningful commercial amount for dashboard totals.
  const candidateValue = Number(candidate.value || 0);
  const savedValue = Number(saved.value || 0);
  if (candidateValue !== savedValue) return candidateValue > savedValue;

  return dateMs(candidate.updatedAt) > dateMs(saved.updatedAt);
}

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

  const emailIndex = buildEmailConversationIndex();
  const results: typeof rawResults = [];
  for (const deal of rawResults) {
    const duplicateIndex = results.findIndex((saved) => isDuplicatePair(deal, saved, emailIndex));
    if (duplicateIndex < 0) {
      results.push(deal);
      continue;
    }
    if (preferCandidate(deal, results[duplicateIndex])) {
      results[duplicateIndex] = deal;
    }
  }
  results.sort((a, b) => dateMs(b.createdAt) - dateMs(a.createdAt));

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
  const existingDeal = db
    .select()
    .from(deals)
    .all()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .find((deal) =>
      isDuplicatePair(
        { contactId, title, value, createdAt: now, notes },
        { contactId: deal.contactId, title: deal.title, value: deal.value, createdAt: deal.createdAt, notes: deal.notes },
        emailIndex
      )
    );

  if (existingDeal) {
    return NextResponse.json(
      {
        ...existingDeal,
        duplicate: true,
        message: "Такая сделка уже существует — повтор не создан",
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
