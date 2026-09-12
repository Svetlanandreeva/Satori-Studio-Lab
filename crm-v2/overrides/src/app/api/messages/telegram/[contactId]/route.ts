import { NextRequest, NextResponse } from "next/server";
import { getTelegramThread } from "@/lib/telegram-inbox";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const thread = getTelegramThread(contactId);
  if (!thread) return NextResponse.json({ error: "Telegram-диалог не найден" }, { status: 404 });
  return NextResponse.json(thread);
}
