import { NextRequest, NextResponse } from "next/server";
import { getTelegramThread, markTelegramThreadRead } from "@/lib/telegram-inbox";
import { listClientDocuments } from "@/lib/client-documents";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const thread = getTelegramThread(contactId);
  if (!thread) return NextResponse.json({ error: "Telegram-диалог не найден" }, { status: 404 });
  markTelegramThreadRead(contactId);
  const documents=listClientDocuments(contactId).filter((d)=>d.sourceChannel==="telegram");
  return NextResponse.json({ ...thread, documents });
}
