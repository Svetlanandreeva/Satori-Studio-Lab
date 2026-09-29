import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { emailMessages } from "@/db/schema";
import { listEmailThreads } from "@/lib/email-integration";
import { cleanEmailSnippet, cleanupLegacyAutoEmailContacts } from "@/lib/email-crm-policy";
import { getMessageIndicatorsStartedAt } from "@/lib/message-indicator-state";
import { emailThreadGroups } from "@/lib/email-inbox-groups";
import { sqlite } from "@/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  cleanupLegacyAutoEmailContacts();
  const filterValue = request.nextUrl.searchParams.get("filter");
  const filter = filterValue === "service" || filterValue === "all" ? filterValue : "client";
  const search = request.nextUrl.searchParams.get("search") || "";
  const startedAt = getMessageIndicatorsStartedAt();

  const newCounts = new Map<string, number>();
  for (const message of db.select().from(emailMessages).all()) {
    if (
      message.direction !== "incoming" ||
      message.isRead ||
      message.receivedAt.getTime() <= startedAt.getTime()
    ) continue;
    newCounts.set(message.threadId, (newCounts.get(message.threadId) || 0) + 1);
  }

  // Ветки одной переписки (разные адреса клиента и его коллег) показываем одним диалогом.
  const groups = emailThreadGroups();
  const contactNames = new Map((sqlite.prepare("SELECT id, name FROM contacts").all() as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
  const merged = new Map<string, ReturnType<typeof listEmailThreads>[number] & { unreadCount: number; addresses: string[] }>();
  for (const thread of listEmailThreads(filter, search)) {
    const key = groups.get(thread.id) || thread.id;
    const unread = newCounts.get(thread.id) || 0;
    const existing = merged.get(key);
    if (!existing) { merged.set(key, { ...thread, unreadCount: unread, addresses: [thread.remoteEmail].filter(Boolean) }); continue; }
    existing.unreadCount += unread;
    if (thread.remoteEmail && !existing.addresses.includes(thread.remoteEmail)) existing.addresses.push(thread.remoteEmail);
    if (!existing.contactId && thread.contactId) existing.contactId = thread.contactId;
    // Список отсортирован по свежести — первая ветка самая новая, её и оставляем «лицом» диалога.
  }
  const threads = [...merged.values()].map((thread) => ({
    ...thread,
    remoteName: (thread.contactId && contactNames.get(thread.contactId)) || thread.remoteName,
    lastSnippet: cleanEmailSnippet(thread.lastSnippet || ""),
  }));
  return NextResponse.json({ threads });
}
