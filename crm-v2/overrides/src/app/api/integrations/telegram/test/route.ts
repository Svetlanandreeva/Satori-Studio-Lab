import { NextRequest, NextResponse } from "next/server";
import {
  INTEGRATION_KEYS,
  getSetting,
  sendTelegramMessage,
  telegramApiRequest,
} from "@/lib/satori-integrations";
import { configureTelegramWebhook } from "@/lib/telegram-webhook";

interface TelegramBotInfo {
  id?: number;
  username?: string;
  first_name?: string;
}

interface TelegramChatInfo {
  id?: number;
  type?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
}

function externalOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.split(",")[0]?.trim() || "";

  if (!host || /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) {
    return process.env.CRM_PUBLIC_URL || "https://crm.satorilabural.online";
  }

  const proto = forwardedProto === "http" ? "http" : "https";
  return `${proto}://${host}`;
}

export async function POST(request: NextRequest) {
  try {
    await configureTelegramWebhook();
  } catch (error) {
    return NextResponse.json(
      {
        error: `Telegram уведомления доступны, но входящие не подключились: ${
          error instanceof Error ? error.message : "ошибка webhook"
        }`,
      },
      { status: 400 }
    );
  }

  const token = getSetting(INTEGRATION_KEYS.telegramBotToken) || "";
  const chatId = getSetting(INTEGRATION_KEYS.telegramChatId) || "";

  const result = await sendTelegramMessage({
    text:
      "✅ <b>SATORI CRM</b>\nТестовое уведомление доставлено. CRM готова принимать Telegram-события.",
    url: `${externalOrigin(request)}/settings`,
  });

  if (!result.sent) {
    return NextResponse.json(
      { error: result.error || "Не удалось отправить тестовое сообщение" },
      { status: 400 }
    );
  }

  let bot: TelegramBotInfo | null = null;
  let recipient: TelegramChatInfo | null = null;

  if (token) {
    try {
      const me = await telegramApiRequest<TelegramBotInfo>(token, "getMe", {});
      if (me.ok && me.result) bot = me.result;
    } catch {}
    if (chatId) {
      try {
        const chat = await telegramApiRequest<TelegramChatInfo>(token, "getChat", {
          chat_id: chatId,
        });
        if (chat.ok && chat.result) recipient = chat.result;
      } catch {}
    }
  }

  return NextResponse.json({
    success: true,
    inbound: true,
    bot: bot ? { username: bot.username || "", name: bot.first_name || "" } : null,
    recipient: recipient
      ? {
          type: recipient.type || "",
          username: recipient.username || "",
          name:
            [recipient.first_name, recipient.last_name].filter(Boolean).join(" ") ||
            recipient.title ||
            "",
        }
      : null,
  });
}
