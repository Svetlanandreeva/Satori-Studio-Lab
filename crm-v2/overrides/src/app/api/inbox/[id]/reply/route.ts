import { NextRequest, NextResponse } from "next/server";
import { replyToEmailThread } from "@/lib/email-integration";

export const runtime = "nodejs";

export async function POST(
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

  try {
    const result = await replyToEmailThread(id, String(body.message || ""));
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось отправить письмо" },
      { status: 400 }
    );
  }
}
