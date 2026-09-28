import { NextRequest, NextResponse } from "next/server";
import {
  INTEGRATION_KEYS,
  getSetting,
  telegramApiRequest,
} from "@/lib/satori-integrations";
import { configureTelegramWebhook } from "@/lib/telegram-webhook";

interface TelegramUpdate {
  message?: {
    chat?: {
      id?: number | string;
      username?: string;
      first_name?: string;
      last_name?: string;
      type?: string;
    };
  };
  edited_message?: {
    chat?: {
      id?: number | string;
      username?: string;
      first_name?: string;
      last_name?: string;
      type?: string;
    };
  };
  callback_query?: {
    message?: {
      chat?: {
        id?: number | string;
        username?: string;
        first_name?: string;
        last_name?: string;
        type?: string;
      };
    };
  };
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {}

  const supplied =
    typeof body.telegramBotToken === "string" ? body.telegramBotToken.trim() : "";
  const savedToken = getSetting(INTEGRATION_KEYS.telegramBotToken) || "";
  const token = supplied || savedToken;

  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    return NextResponse.json(
      { error: "Сначала укажите корректный токен Telegram-бота" },
      { status: 400 }
    );
  }

  let hadWebhook = false;
  try {
    const webhook = await telegramApiRequest<{ url?: string }>(token, "getWebhookInfo", {});
    hadWebhook = Boolean(webhook.ok && webhook.result?.url);
    if (hadWebhook) {
      const deleted = await telegramApiRequest(token, "deleteWebhook", {
        drop_pending_updates: false,
      });
      if (!deleted.ok) {
        throw new Error(deleted.description || "Не удалось временно отключить webhook");
      }
    }

    const data = await telegramApiRequest<TelegramUpdate[]>(token, "getUpdates", {
      limit: 100,
      timeout: 0,
      allowed_updates: ["message", "edited_message", "callback_query"],
    });

    if (!data.ok) {
      return NextResponse.json(
        { error: data.description || "Telegram не вернул обновления" },
        { status: 400 }
      );
    }

    const updates = Array.isArray(data.result) ? data.result : [];
    for (let i = updates.length - 1; i >= 0; i -= 1) {
      const update = updates[i];
      const chat =
        update.message?.chat ||
        update.edited_message?.chat ||
        update.callback_query?.message?.chat;

      if (chat?.id !== undefined && chat?.id !== null && chat.type === "private") {
        return NextResponse.json({
          success: true,
          chatId: String(chat.id),
          username: chat.username || null,
          firstName:
            [chat.first_name, chat.last_name].filter(Boolean).join(" ") || null,
          type: chat.type || null,
        });
      }
    }

    return NextResponse.json(
      {
        error:
          "Нового личного сообщения боту не найдено. Отправьте боту /start или любое сообщение и сразу нажмите «Найти chat ID» ещё раз.",
      },
      { status: 404 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось обратиться к Telegram" },
      { status: 500 }
    );
  } finally {
    if (hadWebhook && savedToken && token === savedToken) {
      try {
        await configureTelegramWebhook();
      } catch {}
    }
  }
}
