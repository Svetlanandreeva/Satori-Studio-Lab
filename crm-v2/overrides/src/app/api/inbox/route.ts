import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { emailMessages } from "@/db/schema";
import { listEmailThreads } from "@/lib/email-integration";
import { cleanEmailSnippet, cleanupLegacyAutoEmailContacts } from "@/lib/email-crm-policy";
import { getMessageIndicatorsStartedAt } from "@/lib/message-indicator-state";

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

  const threads = listEmailThreads(filter, search).map((thread) => ({
    ...thread,
    unreadCount: newCounts.get(thread.id) || 0,
    lastSnippet: cleanEmailSnippet(thread.lastSnippet || ""),
  }));
  return NextResponse.json({ threads });
}
