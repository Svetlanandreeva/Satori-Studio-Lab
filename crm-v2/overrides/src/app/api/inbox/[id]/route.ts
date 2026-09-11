import { NextRequest, NextResponse } from "next/server";
import { getEmailThread, setThreadService } from "@/lib/email-integration";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = getEmailThread(id);
  if (!result) return NextResponse.json({ error: "Диалог не найден" }, { status: 404 });
  return NextResponse.json(result);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  if (typeof body.isService !== "boolean") {
    return NextResponse.json({ error: "Передайте isService" }, { status: 400 });
  }
  const thread = setThreadService(id, body.isService);
  if (!thread) return NextResponse.json({ error: "Диалог не найден" }, { status: 404 });
  return NextResponse.json(thread);
}
