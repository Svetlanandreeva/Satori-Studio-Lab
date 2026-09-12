import { eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";

const TELEGRAM_TYPES = new Set([
  "telegram_incoming",
  "telegram_outgoing",
  "telegram_business_incoming",
  "telegram_business_outgoing",
]);

function bodyFromDescription(description: string): string {
  const lines = String(description || "").split("\n");
  return lines.length > 1 ? lines.slice(1).join("\n").trim() : String(description || "").trim();
}

function telegramMeta(notes: string | null) {
  const raw = String(notes || "");
  const readAtRaw = raw.match(/\[telegram-read-at:([^\]]+)\]/i)?.[1] || null;
  const parsedReadAt = readAtRaw ? new Date(readAtRaw) : null;
  return {
    chatId: raw.match(/\[telegram-chat:([^\]]+)\]/i)?.[1] || null,
    username: raw.match(/\[telegram-user:([^\]]+)\]/i)?.[1] || null,
    businessConnectionId: raw.match(/\[telegram-business:([^\]]+)\]/i)?.[1] || null,
    readAt: parsedReadAt && !Number.isNaN(parsedReadAt.getTime()) ? parsedReadAt : null,
  };
}

function direction(type: string): "incoming" | "outgoing" {
  return type.includes("outgoing") ? "outgoing" : "incoming";
}

function unreadCountFor(
  messages: Array<{ type: string; createdAt: Date }>,
  readAt: Date | null
): number {
  if (!messages.length) return 0;
  if (!readAt) {
    // Do not turn years of historic Telegram into unread noise on first rollout.
    // Until a thread has an explicit read marker, only flag the conversation
    // when its newest message is incoming.
    return direction(messages[0].type) === "incoming" ? 1 : 0;
  }
  return messages.filter(
    (item) => direction(item.type) === "incoming" && item.createdAt.getTime() > readAt.getTime()
  ).length;
}

function withTelegramReadAt(notes: string | null, readAt: Date): string {
  const lines = String(notes || "")
    .split("\n")
    .filter((line) => !line.startsWith("[telegram-read-at:"));
  lines.push(`[telegram-read-at:${readAt.toISOString()}]`);
  return lines.filter(Boolean).join("\n");
}

export function markTelegramThreadRead(contactId: string) {
  const contact = db.select().from(contacts).all().find((item) => item.id === contactId);
  if (!contact) return false;
  db.update(contacts)
    .set({ notes: withTelegramReadAt(contact.notes, new Date()) })
    .where(eq(contacts.id, contactId))
    .run();
  return true;
}

export function listTelegramThreads(search = "") {
  const q = search.trim().toLowerCase();
  const allActivities = db.select().from(activities).all()
    .filter((item) => TELEGRAM_TYPES.has(item.type) && item.contactId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const allContacts = db.select().from(contacts).all();
  const contactMap = new Map(allContacts.map((contact) => [contact.id, contact]));
  const activitiesByContact = new Map<string, Array<(typeof allActivities)[number]>>();
  for (const activity of allActivities) {
    if (!activity.contactId) continue;
    const bucket = activitiesByContact.get(activity.contactId) || [];
    bucket.push(activity);
    activitiesByContact.set(activity.contactId, bucket);
  }
  const seen = new Set<string>();
  const result: Array<Record<string, unknown>> = [];

  for (const item of allActivities) {
    if (!item.contactId || seen.has(item.contactId)) continue;
    const contact = contactMap.get(item.contactId);
    if (!contact) continue;
    const meta = telegramMeta(contact.notes);
    const haystack = [contact.name, contact.company, contact.phone, meta.username, bodyFromDescription(item.description)]
      .filter(Boolean).join(" ").toLowerCase();
    if (q && !haystack.includes(q)) continue;
    seen.add(item.contactId);
    result.push({
      id: contact.id,
      contactId: contact.id,
      remoteName: contact.name,
      remoteHandle: meta.username ? `@${meta.username.replace(/^@/, "")}` : contact.phone || "Telegram",
      channel: meta.businessConnectionId ? "telegram_account" : "telegram_bot",
      lastMessageAt: item.createdAt.toISOString(),
      lastSnippet: bodyFromDescription(item.description),
      lastDirection: direction(item.type),
      unreadCount: unreadCountFor(activitiesByContact.get(item.contactId) || [], meta.readAt),
    });
  }
  return result;
}

export function getTelegramThread(contactId: string) {
  const contact = db.select().from(contacts).all().find((item) => item.id === contactId);
  if (!contact) return null;
  const meta = telegramMeta(contact.notes);
  const messages = db.select().from(activities).all()
    .filter((item) => item.contactId === contactId && TELEGRAM_TYPES.has(item.type))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((item) => ({
      id: item.id,
      direction: direction(item.type),
      bodyText: bodyFromDescription(item.description),
      receivedAt: item.createdAt.toISOString(),
      channel: item.type.includes("business") ? "telegram_account" : "telegram_bot",
    }));

  if (!messages.length && !meta.chatId) return null;
  return {
    thread: {
      id: contact.id,
      contactId: contact.id,
      remoteName: contact.name,
      remoteHandle: meta.username ? `@${meta.username.replace(/^@/, "")}` : contact.phone || "Telegram",
      channel: meta.businessConnectionId ? "telegram_account" : "telegram_bot",
      lastMessageAt: messages.at(-1)?.receivedAt || contact.updatedAt.toISOString(),
    },
    messages,
    contact: { id: contact.id, name: contact.name, company: contact.company, phone: contact.phone },
  };
}
