import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/satori-integrations";

export async function POST(request: NextRequest) {
  const result = await sendTelegramMessage({
    text: "✅ <b>SATORI CRM</b>\nTelegram подключён. Уведомления о новых лидах Need Number будут приходить сюда.",
    url: `${request.nextUrl.origin}/settings`,
  });

  if (!result.sent) {
    return NextResponse.json(
      { error: result.error || "Не удалось отправить тестовое сообщение" },
      { status: 400 }
    );
  }
  return NextResponse.json({ success: true });
}
