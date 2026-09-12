import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts, deals, emailMessages, emailThreads, pipelineStages } from "@/db/schema";

const LEGACY_AUTO_EMAIL_NOTE = "Создан автоматически из входящего письма";
const MANUAL_EMAIL_NOTE = "Добавлен вручную из почты";
const INITIAL_STAGE_NAME = "Новый запрос";

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", hellip: "…", ndash: "–", mdash: "—",
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    const key = entity.toLowerCase();
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[key] ?? match;
  });
}

function stripHtml(value: string): string {
  let text = decodeHtmlEntities(value);
  text = text
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<div\b[^>]*class=["'][^"']*(?:gmail_quote|yahoo_quoted|moz-cite-prefix)[^"']*["'][^>]*>[\s\S]*$/gi, "")
    .replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(text);
}

function stripQuotedHistory(value: string): string {
  let text = value
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();

  const cutPatterns = [
    /\n(?:On .{1,500}wrote:)[\s\S]*$/i,
    /\n(?:В .{1,500}(?:писал|писала|написал|написала)(?:\(а\))?:)[\s\S]*$/i,
    /\n-{2,}\s*(?:Original Message|Исходное сообщение)\s*-{2,}[\s\S]*$/i,
    /\n(?:From|От):[^\n]*\n(?:Sent|Отправлено|Date|Дата):[\s\S]*$/i,
    /\n_{5,}[\s\S]*$/,
  ];
  for (const pattern of cutPatterns) text = text.replace(pattern, "");

  const lines = text.split("\n");
  const hasOwnText = lines.some((line) => line.trim() && !/^>/.test(line.trim()));
  if (hasOwnText) text = lines.filter((line) => !/^>/.test(line.trim())).join("\n");

  text = text
    .replace(/\n--\s*\n[\s\S]*$/, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

export function cleanEmailDisplayBody(value: unknown): string {
  const raw = String(value || "");
  const plain = /<\/?[a-z][\s\S]*>/i.test(raw) || /&lt;\/?[a-z]/i.test(raw) ? stripHtml(raw) : decodeHtmlEntities(raw);
  return stripQuotedHistory(plain).slice(0, 120_000);
}

export function cleanEmailSnippet(value: unknown): string {
  return cleanEmailDisplayBody(value).replace(/\s+/g, " ").trim().slice(0, 220);
}

function findContactByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return db.select().from(contacts).all().find((contact) => String(contact.email || "").trim().toLowerCase() === normalized) || null;
}

function initialPipelineStage() {
  const stages = db.select().from(pipelineStages).orderBy(asc(pipelineStages.order)).all();
  return stages.find((stage) => stage.name === INITIAL_STAGE_NAME)
    || stages.find((stage) => !stage.isWon && !stage.isLost && stage.name !== "Спам")
    || null;
}

function latestDealForContact(contactId: string) {
  const rows = db.select().from(deals).where(eq(deals.contactId, contactId)).orderBy(desc(deals.updatedAt)).all();
  const active = rows.find((deal) => {
    const stage = db.select().from(pipelineStages).where(eq(pipelineStages.id, deal.stageId)).get();
    return stage && !stage.isWon && !stage.isLost;
  });
  return active || rows[0] || null;
}

export function cleanupLegacyAutoEmailContacts(): number {
  const candidates = db.select().from(contacts).all().filter((contact) =>
    contact.source === "email" && String(contact.notes || "").includes(LEGACY_AUTO_EMAIL_NOTE)
  );
  let removed = 0;
  for (const contact of candidates) {
    const hasDeal = Boolean(db.select({ id: deals.id }).from(deals).where(eq(deals.contactId, contact.id)).get());
    const hasActivity = Boolean(db.select({ id: activities.id }).from(activities).where(eq(activities.contactId, contact.id)).get());
    if (hasDeal || hasActivity) continue;
    db.update(emailThreads)
      .set({ contactId: null, updatedAt: new Date() })
      .where(eq(emailThreads.contactId, contact.id))
      .run();
    db.delete(contacts).where(eq(contacts.id, contact.id)).run();
    removed += 1;
  }
  return removed;
}

export function setEmailThreadService(threadId: string, isService: boolean) {
  const thread = db.select().from(emailThreads).where(eq(emailThreads.id, threadId)).get();
  if (!thread) return null;
  const now = new Date();
  db.update(emailThreads).set({ isService, updatedAt: now }).where(eq(emailThreads.id, threadId)).run();
  db.update(emailMessages).set({ isService }).where(eq(emailMessages.threadId, threadId)).run();
  return db.select().from(emailThreads).where(eq(emailThreads.id, threadId)).get();
}

export function getContactPipelineContext(contactId: string | null | undefined) {
  if (!contactId) return null;
  const deal = latestDealForContact(contactId);
  if (!deal) return null;
  const stage = db.select().from(pipelineStages).where(eq(pipelineStages.id, deal.stageId)).get();
  return stage ? { id: deal.id, title: deal.title, stageId: stage.id, stageName: stage.name } : null;
}

export function promoteEmailThreadToCrm(threadId: string) {
  cleanupLegacyAutoEmailContacts();
  const thread = db.select().from(emailThreads).where(eq(emailThreads.id, threadId)).get();
  if (!thread) throw new Error("Диалог не найден");

  let contact = findContactByEmail(thread.remoteEmail);
  const now = new Date();
  if (!contact) {
    contact = db.insert(contacts).values({
      id: crypto.randomUUID(),
      name: String(thread.remoteName || "").trim() || thread.remoteEmail.split("@")[0] || "Email клиент",
      email: thread.remoteEmail,
      phone: null,
      company: null,
      source: "email",
      temperature: "warm",
      qualification: "working",
      score: 50,
      notes: MANUAL_EMAIL_NOTE,
      createdAt: now,
      updatedAt: now,
    }).returning().get();
  }

  let deal = latestDealForContact(contact.id);
  if (!deal || (() => {
    const stage = db.select().from(pipelineStages).where(eq(pipelineStages.id, deal!.stageId)).get();
    return Boolean(stage?.isWon || stage?.isLost);
  })()) {
    const stage = initialPipelineStage();
    if (!stage) throw new Error("В CRM нет первого этапа воронки");
    const cleanSubject = String(thread.subject || "").replace(/^\s*re:\s*/i, "").trim();
    deal = db.insert(deals).values({
      id: crypto.randomUUID(),
      title: cleanSubject || `Запрос — ${contact.name}`,
      value: 0,
      stageId: stage.id,
      contactId: contact.id,
      expectedClose: null,
      probability: 10,
      notes: `[email-thread:${thread.id}] Добавлено вручную из почты`,
      createdAt: now,
      updatedAt: now,
    }).returning().get();
  }

  db.update(emailThreads)
    .set({ contactId: contact.id, isService: false, updatedAt: now })
    .where(eq(emailThreads.id, thread.id))
    .run();
  db.update(emailMessages).set({ isService: false }).where(eq(emailMessages.threadId, thread.id)).run();

  const stage = db.select().from(pipelineStages).where(eq(pipelineStages.id, deal.stageId)).get();
  return { contact, deal, stageName: stage?.name || INITIAL_STAGE_NAME };
}

export function ensureContactsHavePipelineDeals(): number {
  cleanupLegacyAutoEmailContacts();
  const stage = initialPipelineStage();
  if (!stage) return 0;
  const represented = new Set(db.select({ contactId: deals.contactId }).from(deals).all().map((row) => row.contactId));
  let created = 0;
  for (const contact of db.select().from(contacts).all()) {
    if (represented.has(contact.id)) continue;
    const now = new Date();
    db.insert(deals).values({
      id: crypto.randomUUID(),
      title: `Запрос — ${contact.name}`,
      value: 0,
      stageId: stage.id,
      contactId: contact.id,
      expectedClose: null,
      probability: 10,
      notes: "Автоматически создано для связи клиента с воронкой",
      createdAt: now,
      updatedAt: now,
    }).run();
    represented.add(contact.id);
    created += 1;
  }
  return created;
}
