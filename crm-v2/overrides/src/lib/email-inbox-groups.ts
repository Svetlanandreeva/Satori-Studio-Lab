import { sqlite } from "@/db";
import { buildEmailConversationIndex, normalizeEmailSubject } from "@/lib/email-conversation";

/**
 * Одна переписка = один диалог в «Сообщениях», даже если клиент и его коллеги
 * писали с разных адресов. Объединяем ветки из индекса переписок
 * (References, тема + общий участник) и ветки одного клиента с одной темой.
 */
export function emailThreadGroups(): Map<string, string> {
  const threads = sqlite.prepare("SELECT id, contact_id AS contactId, subject FROM email_threads").all() as Array<{ id: string; contactId: string | null; subject: string | null }>;
  const index = buildEmailConversationIndex();
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb < ra ? ra : rb, rb < ra ? rb : ra); };
  for (const t of threads) parent.set(t.id, t.id);
  const byConversation = new Map<string, string>();
  const byContactSubject = new Map<string, string>();
  for (const t of threads) {
    const conv = index.conversationByThreadId.get(t.id) || t.id;
    const prev = byConversation.get(conv); if (prev) union(prev, t.id); else byConversation.set(conv, t.id);
    const subject = normalizeEmailSubject(t.subject);
    if (t.contactId && subject && subject !== "без темы" && subject.length >= 5) {
      const key = `${t.contactId}\n${subject}`;
      const p = byContactSubject.get(key); if (p) union(p, t.id); else byContactSubject.set(key, t.id);
    }
  }
  const out = new Map<string, string>();
  for (const t of threads) out.set(t.id, find(t.id));
  return out;
}

/** Все ветки той же переписки, что и threadId. */
export function emailGroupThreadIds(threadId: string): string[] {
  const groups = emailThreadGroups();
  const root = groups.get(threadId);
  if (!root) return [threadId];
  return [...groups].filter(([, r]) => r === root).map(([id]) => id);
}
