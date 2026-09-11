import { randomBytes, timingSafeEqual } from "node:crypto";
import https from "node:https";
import { db } from "@/db";
import { crmSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const INTEGRATION_KEYS = {
  telegramBotToken: "satori_telegram_bot_token",
  telegramChatId: "satori_telegram_chat_id",
  needNumberSecret: "satori_need_number_secret",
  needNumberProjectId: "satori_need_number_project_id",
  needNumberCreateDeal: "satori_need_number_create_deal",
  emailAddress: "satori_email_address",
  emailUsername: "satori_email_username",
  emailPassword: "satori_email_password",
  emailImapHost: "satori_email_imap_host",
  emailImapPort: "satori_email_imap_port",
  emailImapSecure: "satori_email_imap_secure",
  emailSmtpHost: "satori_email_smtp_host",
  emailSmtpPort: "satori_email_smtp_port",
  emailSmtpSecure: "satori_email_smtp_secure",
  emailFromName: "satori_email_from_name",
  emailIgnoreSenders: "satori_email_ignore_senders",
  emailIgnoreSubjects: "satori_email_ignore_subjects",
  emailSyncDays: "satori_email_sync_days",
  emailLastSyncAt: "satori_email_last_sync_at",
  emailLastSyncError: "satori_email_last_sync_error",
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

export interface TelegramApiResponse<T = unknown> {
  ok?: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

const TELEGRAM_API_HOST = "api.telegram.org";
// The VPS resolver currently returns 149.154.166.110, which is unreachable from
// the hosting network, while Telegram's 149.154.167.220 endpoint is reachable.
// Keep SNI/Host as api.telegram.org so TLS remains fully verified. The env var
// allows the address to be replaced without a code release if Telegram rotates it.
const TELEGRAM_API_FALLBACK_IP = process.env.TELEGRAM_API_IP || "149.154.167.220";

function telegramApiRequestOnce<T>(
  token: string,
  method: string,
  payload: Record<string, unknown>,
  forcedIp?: string
): Promise<TelegramApiResponse<T>> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = https.request(
      {
        protocol: "https:",
        hostname: forcedIp || TELEGRAM_API_HOST,
        servername: TELEGRAM_API_HOST,
        port: 443,
        path: `/bot${token}/${method}`,
        method: "POST",
        family: 4,
        headers: {
          host: TELEGRAM_API_HOST,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "user-agent": "SATORI-CRM/1.0",
        },
        timeout: forcedIp ? 9000 : 4500,
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          try {
            const parsed = JSON.parse(raw || "{}") as TelegramApiResponse<T>;
            if ((response.statusCode || 500) >= 400 && !parsed.description) {
              parsed.description = `Telegram HTTP ${response.statusCode}`;
            }
            resolve(parsed);
          } catch {
            resolve({
              ok: false,
              description: `Telegram вернул некорректный ответ (HTTP ${response.statusCode || 0})`,
            });
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Telegram API timeout${forcedIp ? " (fallback)" : ""}`));
    });
    request.on("error", (error) => reject(error));
    request.end(body);
  });
}

/**
 * Telegram API transport for the CRM VPS.
 *
 * First try the resolver normally. If that route times out or is blocked by the
 * hosting network, retry the same HTTPS request against a known reachable
 * Telegram API address while preserving api.telegram.org as SNI and Host.
 */
export async function telegramApiRequest<T = unknown>(
  token: string,
  method: string,
  payload: Record<string, unknown> = {}
): Promise<TelegramApiResponse<T>> {
  let firstError: unknown = null;
  try {
    const result = await telegramApiRequestOnce<T>(token, method, payload);
    if (result.ok || result.error_code) return result;
    // A valid Telegram HTTP response means networking worked; do not mask a
    // bot/token/chat error by trying another IP.
    if (result.description) return result;
  } catch (error) {
    firstError = error;
  }

  try {
    return await telegramApiRequestOnce<T>(
      token,
      method,
      payload,
      TELEGRAM_API_FALLBACK_IP
    );
  } catch (error) {
    const source = error instanceof Error ? error : firstError;
    const code = (source as NodeJS.ErrnoException | null)?.code;
    const suffix = code ? ` (${code})` : "";
    const message = source instanceof Error ? source.message : "network error";
    throw new Error(`Не удалось соединиться с Telegram API${suffix}: ${message}`);
  }
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

    const data = await telegramApiRequest(token, "sendMessage", payload);
    if (!data.ok) {
      return {
        sent: false,
        error: data.description || "Telegram отклонил сообщение",
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
