import { randomBytes } from "node:crypto";
import { getSetting, setSetting, telegramApiRequest } from "@/lib/satori-integrations";

export const TELEGRAM_WEBHOOK_SECRET_KEY = "satori_telegram_webhook_secret";
export const TELEGRAM_WEBHOOK_ENABLED_KEY = "satori_telegram_webhook_enabled";
export const TELEGRAM_WEBHOOK_URL_KEY = "satori_telegram_webhook_url";

export function ensureTelegramWebhookSecret(): string {
  const existing = getSetting(TELEGRAM_WEBHOOK_SECRET_KEY);
  if (existing && existing.length >= 24) return existing;
  const value = randomBytes(24).toString("hex");
  setSetting(TELEGRAM_WEBHOOK_SECRET_KEY, value);
  return value;
}

export function telegramWebhookUrl(): string {
  const origin = (process.env.CRM_PUBLIC_URL || "https://crm.satorilabural.online").replace(/\/$/, "");
  return `${origin}/api/integrations/need-number?telegram=1`;
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

  const info = await telegramApiRequest<{
    url?: string;
    pending_update_count?: number;
    last_error_message?: string;
  }>(token, "getWebhookInfo", {});

  setSetting(TELEGRAM_WEBHOOK_ENABLED_KEY, "1");
  setSetting(TELEGRAM_WEBHOOK_URL_KEY, info.result?.url || url);

  return {
    webhookUrl: info.result?.url || url,
    pendingUpdates: info.result?.pending_update_count || 0,
    lastError: info.result?.last_error_message || "",
  };
}
