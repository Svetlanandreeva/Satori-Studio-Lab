import { NextRequest, NextResponse } from "next/server";
import {
  INTEGRATION_KEYS,
  getSetting,
} from "@/lib/satori-integrations";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {}

  const supplied = typeof body.telegramBotToken === "string"
    ? body.telegramBotToken.trim()
    : "";
  const token = supplied || getSetting(INTEGRATION_KEYS.telegramBotToken) || "";

  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    return NextResponse.json(
      { error: "Сначала укажите корректный токен Telegram-бота" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?limit=100&timeout=0`,
      { cache: "no-store" }
    );
    const data = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: Array<Record<string, unknown>>;
    };

    if (!response.ok || !data.ok) {
      return NextResponse.json(
        { error: data.description || `Telegram HTTP ${response.status}` },
        { status: 400 }
      );
    }

    const updates = Array.isArray(data.result) ? data.result : [];
    for (let i = updates.length - 1; i >= 0; i -= 1) {
      const update = updates[i] as Record<string, unknown>;
      const message = (update.message || update.edited_message || update.callback_query) as
        | Record<string, unknown>
        | undefined;
      const actualMessage = message?.message && typeof message.message === "object"
        ? (message.message as Record<string, unknown>)
        : message;
      const chat = actualMessage?.chat as Record<string, unknown> | undefined;
      if (chat?.id !== undefined && chat?.id !== null) {
        return NextResponse.json({
          success: true,
          chatId: String(chat.id),
          username: typeof chat.username === "string" ? chat.username : null,
          firstName: typeof chat.first_name === "string" ? chat.first_name : null,
          type: typeof chat.type === "string" ? chat.type : null,
        });
      }
    }

    return NextResponse.json(
      {
        error: "Сообщений боту пока нет. Откройте бота в Telegram, нажмите Start или отправьте /start и повторите поиск.",
      },
      { status: 404 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось обратиться к Telegram" },
      { status: 500 }
    );
  }
}
