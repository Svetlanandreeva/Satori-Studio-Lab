import { randomBytes } from "node:crypto";
import { getSetting, setSetting, telegramApiRequest } from "@/lib/satori-integrations";

export const TELEGRAM_WEBHOOK_SECRET_KEY = "satori_telegram_webhook_secret";
export const TELEGRAM_WEBHOOK_ENABLED_KEY = "satori_telegram_webhook_enabled";
export const TELEGRAM_WEBHOOK_URL_KEY = "satori_telegram_webhook_url";
export const TELEGRAM_WEBHOOK_ERROR_KEY = "satori_telegram_webhook_last_error";
export const TELEGRAM_WEBHOOK_LAST_CHECKED_KEY = "satori_telegram_webhook_last_checked_at";

export interface TelegramWebhookInfo {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  allowed_updates?: string[];
}

export function ensureTelegramWebhookSecret(): string {
  const existing = getSetting(TELEGRAM_WEBHOOK_SECRET_KEY);
  if (existing && existing.length >= 24) return existing;
  const value = randomBytes(24).toString("hex");
  setSetting(TELEGRAM_WEBHOOK_SECRET_KEY, value);
  return value;
}

export function telegramWebhookUrl(): string {
  const origin = (process.env.CRM_PUBLIC_URL || "https://crm.satorilabural.online").replace(/\/$/, "");
  // Keep Telegram on the public integration entrypoint. It proxies internally to
  // the protected CRM webhook and also imports Telegram attachments. The query
  // string does not change nginx's exact URI match for /api/integrations/need-number.
  return `${origin}/api/integrations/need-number?telegram=1`;
}

export async function readTelegramWebhookInfo() {
  const token = getSetting("satori_telegram_bot_token");
  if (!token) {
    return {
      configured: false,
      healthy: false,
      expectedUrl: telegramWebhookUrl(),
      webhookUrl: "",
      pendingUpdates: 0,
      lastError: "Telegram-бот не настроен",
      lastErrorAt: null as string | null,
      allowedUpdates: [] as string[],
    };
  }

  const info = await telegramApiRequest<TelegramWebhookInfo>(token, "getWebhookInfo", {});
  if (!info.ok) throw new Error(info.description || "Telegram не вернул состояние webhook");

  const expectedUrl = telegramWebhookUrl();
  const webhookUrl = info.result?.url || "";
  const lastError = info.result?.last_error_message || "";
  const lastErrorAt = info.result?.last_error_date
    ? new Date(info.result.last_error_date * 1000).toISOString()
    : null;
  const configured = webhookUrl === expectedUrl;
  const healthy = configured && !lastError;

  setSetting(TELEGRAM_WEBHOOK_ENABLED_KEY, configured ? "1" : "0");
  setSetting(TELEGRAM_WEBHOOK_URL_KEY, webhookUrl);
  setSetting(TELEGRAM_WEBHOOK_ERROR_KEY, lastError);
  setSetting(TELEGRAM_WEBHOOK_LAST_CHECKED_KEY, new Date().toISOString());

  return {
    configured,
    healthy,
    expectedUrl,
    webhookUrl,
    pendingUpdates: info.result?.pending_update_count || 0,
    lastError,
    lastErrorAt,
    allowedUpdates: info.result?.allowed_updates || [],
  };
}

export async function configureTelegramWebhook() {
  const token = getSetting("satori_telegram_bot_token");
  if (!token) throw new Error("Сначала сохрани токен Telegram-бота");

  const secret = ensureTelegramWebhookSecret();
  const url = telegramWebhookUrl();
  const result = await telegramApiRequest(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: [
      "message",
      "edited_message",
      "business_connection",
      "business_message",
      "edited_business_message",
      "deleted_business_messages",
    ],
    drop_pending_updates: false,
  });
  if (!result.ok) throw new Error(result.description || "Telegram не принял webhook");

  const health = await readTelegramWebhookInfo();
  setSetting(TELEGRAM_WEBHOOK_ENABLED_KEY, health.configured ? "1" : "0");
  setSetting(TELEGRAM_WEBHOOK_URL_KEY, health.webhookUrl || url);
  setSetting(TELEGRAM_WEBHOOK_ERROR_KEY, health.lastError || "");

  return health;
}
