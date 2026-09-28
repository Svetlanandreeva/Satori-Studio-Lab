import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailMessages, emailThreads } from "@/db/schema";

const PUBLIC_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yandex.ru", "ya.ru", "mail.ru", "bk.ru", "inbox.ru", "list.ru",
  "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "rambler.ru",
]);
const LEGACY_SUBJECT_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

export function normalizeEmailMessageId(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^<|>$/g, "")
    .trim();
}

export function emailReferenceIds(references: unknown, inReplyTo?: unknown): string[] {
  const values: string[] = [];
  const pushValue = (value: unknown) => {
    const raw = String(value || "").trim();
    if (!raw) return;
    const tokens = raw.match(/<[^>]+>|[^\s,]+/g) || [];
    for (const token of tokens) {
      const normalized = normalizeEmailMessageId(token);
      if (normalized && !values.includes(normalized)) values.push(normalized);
    }
  };
  if (Array.isArray(references)) references.forEach(pushValue);
  else pushValue(references);
  pushValue(inReplyTo);
  return values;
}

export function normalizeEmailSubject(value: unknown): string {
  let subject = String(value || "Без темы")
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();
  while (/^(?:re|fw|fwd|ответ|пересл|пересылка)\s*:\s*/i.test(subject)) {
    subject = subject.replace(/^(?:re|fw|fwd|ответ|пересл|пересылка)\s*:\s*/i, "").trim();
  }
  return subject.replace(/\s+/g, " ").slice(0, 500) || "без темы";
}

function emailDomain(value: unknown): string {
  const email = String(value || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "";
}

function messageThreadMap() {
  const rows = db.select().from(emailMessages).all();
  const byMessageId = new Map<string, string>();
  for (const row of rows) {
    const id = normalizeEmailMessageId(row.messageId);
    if (id) byMessageId.set(id, row.threadId);
  }
  return { rows, byMessageId };
}

export function resolveEmailThreadForMessage(input: {
  messageId: string;
  inReplyTo?: string | null;
  references?: string | string[] | null;
  remoteEmail: string;
  subject: string;
}) {
  const { byMessageId } = messageThreadMap();
  const references = emailReferenceIds(input.references, input.inReplyTo);

  for (const reference of references.slice().reverse()) {
    const linkedThreadId = byMessageId.get(reference);
    if (!linkedThreadId) continue;
    const thread = db.select().from(emailThreads).where(eq(emailThreads.id, linkedThreadId)).get();
    if (thread) return { thread, threadKey: thread.threadKey };
  }

  const rootReference = references[0];
  const threadKey = rootReference
    ? `rfc:${rootReference}`
    : `mail:${String(input.remoteEmail || "").trim().toLowerCase()}:${normalizeEmailSubject(input.subject)}`;
  const thread = db.select().from(emailThreads).where(eq(emailThreads.threadKey, threadKey)).get() || null;
  return { thread, threadKey };
}

function conversationAdjacency(): Map<string, Set<string>> {
  const { rows, byMessageId } = messageThreadMap();
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!a || !b || a === b) return;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  };

  for (const message of rows) {
    for (const reference of emailReferenceIds(message.references, message.inReplyTo)) {
      const relatedThreadId = byMessageId.get(reference);
      if (relatedThreadId) link(message.threadId, relatedThreadId);
    }
  }

  // Legacy imports sometimes split one mailbox conversation by sender address and
  // lost the RFC References chain. Recover those threads conservatively: exact
  // normalized subject + same company domain + close enough in time. Public mail
  // providers are excluded to avoid merging unrelated customers on Gmail/Yandex.
  const threads = db.select().from(emailThreads).all();
  const groups = new Map<string, typeof threads>();
  for (const thread of threads) {
    const subject = normalizeEmailSubject(thread.subject);
    const domain = emailDomain(thread.remoteEmail);
    if (!subject || subject === "без темы" || subject.length < 5 || !domain || PUBLIC_MAIL_DOMAINS.has(domain)) continue;
    const key = `${domain}\n${subject}`;
    const group = groups.get(key) || [];
    group.push(thread);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.lastMessageAt.getTime() - b.lastMessageAt.getTime());
    for (let i = 1; i < group.length; i += 1) {
      const prev = group[i - 1];
      const current = group[i];
      if (Math.abs(current.lastMessageAt.getTime() - prev.lastMessageAt.getTime()) <= LEGACY_SUBJECT_WINDOW_MS) {
        link(prev.id, current.id);
      }
    }
  }

  return adjacency;
}

export function emailConversationThreadIds(threadId: string): Set<string> {
  const adjacency = conversationAdjacency();
  const visited = new Set<string>([threadId]);
  const queue = [threadId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return visited;
}

export function emailThreadIdFromDealNotes(notes: unknown): string | null {
  const match = String(notes || "").match(/\[email-thread:([^\]]+)\]/i);
  return match?.[1]?.trim() || null;
}

export type EmailConversationIndex = {
  conversationByThreadId: Map<string, string>;
  conversationsByContactId: Map<string, Set<string>>;
};

export function buildEmailConversationIndex(): EmailConversationIndex {
  const threads = db.select().from(emailThreads).all();
  const adjacency = conversationAdjacency();
  const conversationByThreadId = new Map<string, string>();
  const conversationsByContactId = new Map<string, Set<string>>();

  for (const thread of threads) {
    if (conversationByThreadId.has(thread.id)) continue;
    const component = new Set<string>();
    const queue = [thread.id];
    component.add(thread.id);
    while (queue.length) {
      const current = queue.shift()!;
      for (const next of adjacency.get(current) || []) {
        if (component.has(next)) continue;
        component.add(next);
        queue.push(next);
      }
    }
    const conversationId = Array.from(component).sort()[0] || thread.id;
    for (const threadId of component) conversationByThreadId.set(threadId, conversationId);
  }

  for (const thread of threads) {
    if (!thread.contactId) continue;
    const conversationId = conversationByThreadId.get(thread.id) || thread.id;
    const set = conversationsByContactId.get(thread.contactId) || new Set<string>();
    set.add(conversationId);
    conversationsByContactId.set(thread.contactId, set);
  }

  return { conversationByThreadId, conversationsByContactId };
}

function conversationIdFromNotes(notes: unknown, index: EmailConversationIndex): string | null {
  const threadId = emailThreadIdFromDealNotes(notes);
  if (!threadId) return null;
  return index.conversationByThreadId.get(threadId) || threadId;
}

export function sameEmailConversationForDeals(
  a: { contactId?: string | null; notes?: unknown },
  b: { contactId?: string | null; notes?: unknown },
  index: EmailConversationIndex
): boolean {
  const aFromNotes = conversationIdFromNotes(a.notes, index);
  const bFromNotes = conversationIdFromNotes(b.notes, index);
  if (aFromNotes && bFromNotes) return aFromNotes === bFromNotes;

  const aContactId = String(a.contactId || "");
  const bContactId = String(b.contactId || "");
  if (!aContactId || !bContactId || aContactId === bContactId) return false;

  const aConversations = index.conversationsByContactId.get(aContactId);
  const bConversations = index.conversationsByContactId.get(bContactId);
  if (!aConversations || !bConversations) return false;
  for (const conversationId of aConversations) {
    if (bConversations.has(conversationId)) return true;
  }
  return false;
}
