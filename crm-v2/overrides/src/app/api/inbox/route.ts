import { NextRequest, NextResponse } from "next/server";
import { listEmailThreads } from "@/lib/email-integration";
import { cleanEmailSnippet, cleanupLegacyAutoEmailContacts } from "@/lib/email-crm-policy";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  cleanupLegacyAutoEmailContacts();
  const filterValue = request.nextUrl.searchParams.get("filter");
  const filter = filterValue === "service" || filterValue === "all" ? filterValue : "client";
  const search = request.nextUrl.searchParams.get("search") || "";
  const threads = listEmailThreads(filter, search).map((thread) => ({
    ...thread,
    lastSnippet: cleanEmailSnippet(thread.lastSnippet || ""),
  }));
  return NextResponse.json({ threads });
}
