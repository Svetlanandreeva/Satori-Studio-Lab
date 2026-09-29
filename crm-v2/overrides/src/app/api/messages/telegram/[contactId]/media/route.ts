import { NextRequest, NextResponse } from "next/server";
import { sqlite } from "@/db";
import { ensureTelegramMedia } from "@/lib/telegram-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Докачать фото/видео/голосовое/файл из сообщения Telegram, если в фоне не получилось. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const body = await request.json().catch(() => ({})) as { activityId?: string };
  const activityId = String(body.activityId || "");
  const row = sqlite.prepare("SELECT contact_id AS contactId, type FROM activities WHERE id=?").get(activityId) as { contactId: string; type: string } | undefined;
  if (!row || row.contactId !== contactId) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
  try {
    const document = await ensureTelegramMedia(activityId, row.type.includes("outgoing") ? "outgoing" : "incoming");
    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось загрузить файл" }, { status: 422 });
  }
}
