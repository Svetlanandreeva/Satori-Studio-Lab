import { randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { crmSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const INTEGRATION_KEYS = {
  telegramBotToken: "satori_telegram_bot_token",
  telegramChatId: "satori_telegram_chat_id",
  needNumberSecret: "satori_need_number_secret",
  needNumberProjectId: "satori_need_number_project_id",
  needNumberCreateDeal: "satori_need_number_create_deal",
} as const;

export function getSetting(key: string): string | null {
  const row = db
    .select()
    .from(crmSettings)
    .where(eq(crmSettings.key, key))
    .get();
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.insert(crmSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: crmSettings.key,
      set: { value },
    })
    .run();
}

export function getBooleanSetting(key: string, fallback = false): boolean {
  const value = getSetting(key);
  if (value === null) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

export function ensureNeedNumberSecret(): string {
  const existing = getSetting(INTEGRATION_KEYS.needNumberSecret);
  if (existing && existing.length >= 24) return existing;
  const value = randomBytes(24).toString("hex");
  setSetting(INTEGRATION_KEYS.needNumberSecret, value);
  return value;
}

export function safeSecretEqual(received: string | null, expected: string): boolean {
  if (!received) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function normalizeRussianPhone(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let digits = String(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}

export function phoneIdentity(value: unknown): string {
  const normalized = normalizeRussianPhone(value);
  return normalized ? normalized.replace(/\D/g, "") : "";
}

export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendTelegramMessage(input: {
  text: string;
  url?: string | null;
  token?: string | null;
  chatId?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const token = input.token || getSetting(INTEGRATION_KEYS.telegramBotToken);
  const chatId = input.chatId || getSetting(INTEGRATION_KEYS.telegramChatId);

  if (!token || !chatId) {
    return { sent: false, error: "Telegram не настроен" };
  }
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    return { sent: false, error: "Некорректный токен Telegram-бота" };
  }

  try {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text: input.text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    if (input.url && /^https:\/\//i.test(input.url)) {
      payload.reply_markup = {
        inline_keyboard: [[{ text: "Открыть в SATORI CRM", url: input.url }]],
      };
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = (await response.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null;
    if (!response.ok || !data?.ok) {
      return {
        sent: false,
        error: data?.description || `Telegram HTTP ${response.status}`,
      };
    }
    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Ошибка Telegram",
    };
  }
}
