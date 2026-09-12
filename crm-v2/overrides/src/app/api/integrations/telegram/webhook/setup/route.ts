import { NextResponse } from "next/server";
import { getSetting, setSetting, telegramApiRequest } from "@/lib/satori-integrations";
import {
  configureTelegramWebhook,
  TELEGRAM_WEBHOOK_ENABLED_KEY,
  TELEGRAM_WEBHOOK_URL_KEY,
} from "@/lib/telegram-webhook";

export async function POST() {
  try {
    const info = await configureTelegramWebhook();
    return NextResponse.json({ success: true, ...info });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось подключить входящие Telegram" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const token = getSetting("satori_telegram_bot_token");
  if (!token) return NextResponse.json({ success: true });
  try {
    const result = await telegramApiRequest(token, "deleteWebhook", { drop_pending_updates: false });
    if (!result.ok) {
      return NextResponse.json({ error: result.description || "Не удалось отключить webhook" }, { status: 400 });
    }
    setSetting(TELEGRAM_WEBHOOK_ENABLED_KEY, "0");
    setSetting(TELEGRAM_WEBHOOK_URL_KEY, "");
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось отключить webhook" },
      { status: 500 }
    );
  }
}
