import { NextRequest, NextResponse } from "next/server";
import { listTelegramThreads } from "@/lib/telegram-inbox";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search") || "";
  return NextResponse.json({ threads: listTelegramThreads(search) });
}
