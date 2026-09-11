import { NextRequest, NextResponse } from "next/server";
import { listEmailThreads } from "@/lib/email-integration";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const filterValue = request.nextUrl.searchParams.get("filter");
  const filter = filterValue === "service" || filterValue === "all" ? filterValue : "client";
  const search = request.nextUrl.searchParams.get("search") || "";
  return NextResponse.json({ threads: listEmailThreads(filter, search) });
}
