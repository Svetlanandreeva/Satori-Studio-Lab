import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailMessages, emailThreads } from "@/db/schema";

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
  // Mail clients can stack prefixes such as Re: Re: Fwd:.
  while (/^(?:re|fw|fwd|ответ|пересл|пересылка)\s*:\s*/i.test(subject)) {
    subject = subject.replace(/^(?:re|fw|fwd|ответ|пересл|пересылка)\s*:\s*/i, "").trim();
  }
  return subject.replace(/\s+/g, " ").slice(0, 500) || "без темы";
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

  // RFC References/In-Reply-To are the primary conversation identity. This is
  // deliberately independent of sender address: one customer thread may contain
  // several employees with different mailboxes.
  for (const reference of references.slice().reverse()) {
    const linkedThreadId = byMessageId.get(reference);
    if (!linkedThreadId) continue;
    const thread = db.select().from(emailThreads).where(eq(emailThreads.id, linkedThreadId)).get();
    if (thread) return { thread, threadKey: thread.threadKey };
  }

  // If the root message is outside the sync window, replies still share the same
  // References root, so they will land in one thread even before that root is loaded.
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

export function sameEmailConversationFromDealNotes(aNotes: unknown, bNotes: unknown): boolean {
  const aThreadId = emailThreadIdFromDealNotes(aNotes);
  const bThreadId = emailThreadIdFromDealNotes(bNotes);
  if (!aThreadId || !bThreadId) return false;
  if (aThreadId === bThreadId) return true;
  return emailConversationThreadIds(aThreadId).has(bThreadId);
}
