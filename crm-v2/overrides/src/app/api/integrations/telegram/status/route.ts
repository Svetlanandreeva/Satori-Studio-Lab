import { NextResponse } from "next/server";
import { db } from "@/db";
import { activities } from "@/db/schema";
import {
  INTEGRATION_KEYS,
  getSetting,
  setSetting,
  telegramApiRequest,
} from "@/lib/satori-integrations";
import {
  configureTelegramWebhook,
  readTelegramWebhookInfo,
  telegramWebhookUrl,
} from "@/lib/telegram-webhook";

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramBusinessConnection {
  id: string;
  user: TelegramUser;
  user_chat_id?: number;
  date?: number;
  is_enabled: boolean;
  rights?: {
    can_reply?: boolean;
    can_read_messages?: boolean;
  };
}

function timestampMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function latestBusinessMessageAt(): string | null {
  const rows = db.select().from(activities).all();
  const latest = rows
    .filter((row) => String(row.type || "").startsWith("telegram_business_"))
    .sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt))[0];
  const value = timestampMs(latest?.createdAt);
  return value ? new Date(value).toISOString() : null;
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const token = getSetting(INTEGRATION_KEYS.telegramBotToken) || "";
    if (!token) {
      return NextResponse.json({
        tokenConfigured: false,
        webhookConfigured: false,
        webhookHealthy: false,
        expectedWebhookUrl: telegramWebhookUrl(),
        webhookUrl: "",
        pendingUpdates: 0,
        webhookLastError: "Telegram-бот не настроен",
        webhookLastErrorAt: null,
        businessConfigured: false,
        businessEnabled: false,
        businessCanReply: false,
        businessCanReadMessages: false,
        businessUser: null,
        lastBusinessMessageAt: latestBusinessMessageAt(),
      });
    }

    let webhook = await readTelegramWebhookInfo();
    if (!webhook.configured) {
      try {
        await configureTelegramWebhook();
        webhook = await readTelegramWebhookInfo();
      } catch (error) {
        webhook = {
          ...webhook,
          healthy: false,
          lastError: error instanceof Error ? error.message : "Не удалось переподключить webhook",
        };
      }
    }

    const connectionId = getSetting(INTEGRATION_KEYS.telegramBusinessConnectionId) || "";
    let business: TelegramBusinessConnection | null = null;
    let businessError = "";

    if (connectionId) {
      try {
        const response = await telegramApiRequest<TelegramBusinessConnection>(
          token,
          "getBusinessConnection",
          { business_connection_id: connectionId }
        );
        if (response.ok && response.result) {
          business = response.result;
          setSetting(INTEGRATION_KEYS.telegramBusinessUserId, String(business.user.id));
          setSetting(INTEGRATION_KEYS.telegramBusinessEnabled, business.is_enabled ? "1" : "0");
          setSetting(INTEGRATION_KEYS.telegramBusinessCanReply, business.rights?.can_reply ? "1" : "0");
          setSetting("satori_telegram_business_can_read_messages", business.rights?.can_read_messages ? "1" : "0");
        } else {
          businessError = response.description || "Telegram не вернул Business Connection";
        }
      } catch (error) {
        businessError = error instanceof Error ? error.message : "Ошибка проверки Business Connection";
      }
    }

    const businessEnabled = business?.is_enabled ?? (getSetting(INTEGRATION_KEYS.telegramBusinessEnabled) === "1");
    const businessCanReply = business?.rights?.can_reply ?? (getSetting(INTEGRATION_KEYS.telegramBusinessCanReply) === "1");
    const businessCanReadMessages = business?.rights?.can_read_messages ?? (getSetting("satori_telegram_business_can_read_messages") === "1");

    return NextResponse.json({
      tokenConfigured: true,
      webhookConfigured: webhook.configured,
      webhookHealthy: webhook.healthy,
      expectedWebhookUrl: webhook.expectedUrl,
      webhookUrl: webhook.webhookUrl,
      pendingUpdates: webhook.pendingUpdates,
      webhookLastError: webhook.lastError,
      webhookLastErrorAt: webhook.lastErrorAt,
      allowedUpdates: webhook.allowedUpdates,
      businessConfigured: Boolean(connectionId && businessEnabled),
      businessConnectionId: connectionId || null,
      businessEnabled,
      businessCanReply,
      businessCanReadMessages,
      businessError,
      businessUser: business
        ? {
            id: business.user.id,
            username: business.user.username || null,
            name: [business.user.first_name, business.user.last_name].filter(Boolean).join(" ") || null,
          }
        : null,
      lastBusinessMessageAt: latestBusinessMessageAt(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось проверить Telegram" },
      { status: 500 }
    );
  }
}
