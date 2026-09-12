import { NextRequest, NextResponse } from "next/server";
import { promoteEmailThreadToCrm } from "@/lib/email-crm-policy";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = promoteEmailThreadToCrm(id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось добавить письмо в CRM";
    return NextResponse.json({ error: message }, { status: message === "Диалог не найден" ? 404 : 400 });
  }
}
