import { NextRequest, NextResponse } from "next/server";
import {
  INTEGRATION_KEYS,
  ensureNeedNumberSecret,
  getBooleanSetting,
  getSetting,
  setSetting,
} from "@/lib/satori-integrations";
import { configureTelegramWebhook } from "@/lib/telegram-webhook";

const TELEGRAM_WEBHOOK_ENABLED_KEY = "satori_telegram_webhook_enabled";
const TELEGRAM_WEBHOOK_URL_KEY = "satori_telegram_webhook_url";
const TELEGRAM_WEBHOOK_ERROR_KEY = "satori_telegram_webhook_last_error";

const DEFAULT_EMAIL_ADDRESS = "hello@satori.ru";
const YANDEX_IMAP_HOST = "imap.yandex.ru";
const YANDEX_SMTP_HOST = "smtp.yandex.ru";

function isYandexMailbox(address: string): boolean {
  const domain = address.trim().toLowerCase().split("@")[1] || "";
  return domain === "satori.ru" || domain === "yandex.ru" || domain.startsWith("yandex.");
}

function snapshot() {
  const secret = ensureNeedNumberSecret();
  const telegramToken = getSetting(INTEGRATION_KEYS.telegramBotToken);
  const telegramChatId = getSetting(INTEGRATION_KEYS.telegramChatId) || "";
  const telegramInboundConfigured = getBooleanSetting(TELEGRAM_WEBHOOK_ENABLED_KEY, false);
  const telegramWebhookUrl = getSetting(TELEGRAM_WEBHOOK_URL_KEY) || "";
  const telegramWebhookLastError = getSetting(TELEGRAM_WEBHOOK_ERROR_KEY) || "";
  const telegramBusinessConnectionId = getSetting(INTEGRATION_KEYS.telegramBusinessConnectionId) || "";
  const telegramBusinessEnabled = getBooleanSetting(INTEGRATION_KEYS.telegramBusinessEnabled, false);
  const telegramBusinessCanReply = getBooleanSetting(INTEGRATION_KEYS.telegramBusinessCanReply, false);
  const projectId = getSetting(INTEGRATION_KEYS.needNumberProjectId) || "1474";
  const createDeal = getBooleanSetting(INTEGRATION_KEYS.needNumberCreateDeal, true);

  const emailAddress = getSetting(INTEGRATION_KEYS.emailAddress) || DEFAULT_EMAIL_ADDRESS;
  const yandexMailbox = isYandexMailbox(emailAddress);
  const emailUsername = getSetting(INTEGRATION_KEYS.emailUsername) || emailAddress;
  const emailPassword = getSetting(INTEGRATION_KEYS.emailPassword) || "";
  const emailImapHost = getSetting(INTEGRATION_KEYS.emailImapHost) || (yandexMailbox ? YANDEX_IMAP_HOST : "");
  const emailImapPort = Number(getSetting(INTEGRATION_KEYS.emailImapPort) || "993") || 993;
  const emailImapSecure = getBooleanSetting(INTEGRATION_KEYS.emailImapSecure, true);
  const emailSmtpHost = getSetting(INTEGRATION_KEYS.emailSmtpHost) || (yandexMailbox ? YANDEX_SMTP_HOST : "");
  const emailSmtpPort = Number(getSetting(INTEGRATION_KEYS.emailSmtpPort) || "465") || 465;
  const emailSmtpSecure = getBooleanSetting(INTEGRATION_KEYS.emailSmtpSecure, true);
  const emailFromName = getSetting(INTEGRATION_KEYS.emailFromName) || "Satori Studio";
  const emailIgnoreSenders = getSetting(INTEGRATION_KEYS.emailIgnoreSenders) || "";
  const emailIgnoreSubjects = getSetting(INTEGRATION_KEYS.emailIgnoreSubjects) || "";
  const emailSyncDays = Number(getSetting(INTEGRATION_KEYS.emailSyncDays) || "365") || 365;
  const emailLastSyncAt = getSetting(INTEGRATION_KEYS.emailLastSyncAt) || "";
  const emailLastSyncError = getSetting(INTEGRATION_KEYS.emailLastSyncError) || "";

  return {
    telegramConfigured: Boolean(telegramToken && telegramChatId),
    telegramTokenConfigured: Boolean(telegramToken),
    telegramChatId,
    telegramInboundConfigured,
    telegramWebhookUrl,
    telegramWebhookLastError,
    telegramBusinessConfigured: Boolean(telegramBusinessConnectionId && telegramBusinessEnabled),
    telegramBusinessCanReply,
    needNumberProjectId: projectId,
    needNumberCreateDeal: createDeal,
    needNumberWebhookPath: `/api/integrations/need-number?key=${encodeURIComponent(secret)}`,
    emailConfigured: Boolean(emailAddress && emailUsername && emailPassword && emailImapHost && emailSmtpHost),
    emailPasswordConfigured: Boolean(emailPassword),
    emailAddress,
    emailUsername,
    emailImapHost,
    emailImapPort,
    emailImapSecure,
    emailSmtpHost,
    emailSmtpPort,
    emailSmtpSecure,
    emailFromName,
    emailIgnoreSenders,
    emailIgnoreSubjects,
    emailSyncDays,
    emailLastSyncAt,
    emailLastSyncError,
  };
}

function saveString(body: Record<string, unknown>, field: string, key: string) {
  if (typeof body[field] === "string") setSetting(key, String(body[field]).trim());
}

function savePort(body: Record<string, unknown>, field: string, key: string) {
  if (body[field] === undefined) return;
  const value = Number(body[field]);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`Некорректный порт: ${field}`);
  setSetting(key, String(value));
}

async function ensureTelegramInbound() {
  const token = getSetting(INTEGRATION_KEYS.telegramBotToken);
  if (!token || getBooleanSetting(TELEGRAM_WEBHOOK_ENABLED_KEY, false)) return;
  try {
    await configureTelegramWebhook();
    setSetting(TELEGRAM_WEBHOOK_ERROR_KEY, "");
  } catch (error) {
    setSetting(TELEGRAM_WEBHOOK_ENABLED_KEY, "0");
    setSetting(TELEGRAM_WEBHOOK_ERROR_KEY, error instanceof Error ? error.message : "Не удалось включить входящие Telegram");
  }
}

export async function GET() {
  await ensureTelegramInbound();
  return NextResponse.json(snapshot());
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  try {
    const telegramTouched = body.clearTelegram === true || typeof body.telegramBotToken === "string" || typeof body.telegramChatId === "string";

    if (body.clearTelegram === true) {
      setSetting(INTEGRATION_KEYS.telegramBotToken, "");
      setSetting(INTEGRATION_KEYS.telegramChatId, "");
      setSetting(INTEGRATION_KEYS.telegramBusinessConnectionId, "");
      setSetting(INTEGRATION_KEYS.telegramBusinessUserId, "");
      setSetting(INTEGRATION_KEYS.telegramBusinessEnabled, "0");
      setSetting(INTEGRATION_KEYS.telegramBusinessCanReply, "0");
      setSetting(TELEGRAM_WEBHOOK_ENABLED_KEY, "0");
      setSetting(TELEGRAM_WEBHOOK_URL_KEY, "");
      setSetting(TELEGRAM_WEBHOOK_ERROR_KEY, "");
    } else {
      if (typeof body.telegramBotToken === "string" && body.telegramBotToken.trim()) {
        const token = body.telegramBotToken.trim();
        if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
          return NextResponse.json({ error: "Токен Telegram-бота выглядит некорректно" }, { status: 400 });
        }
        setSetting(INTEGRATION_KEYS.telegramBotToken, token);
      }
      if (typeof body.telegramChatId === "string") setSetting(INTEGRATION_KEYS.telegramChatId, body.telegramChatId.trim());
    }

    if (telegramTouched && body.clearTelegram !== true && getSetting(INTEGRATION_KEYS.telegramBotToken)) {
      try {
        await configureTelegramWebhook();
        setSetting(TELEGRAM_WEBHOOK_ERROR_KEY, "");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось включить входящие Telegram";
        setSetting(TELEGRAM_WEBHOOK_ENABLED_KEY, "0");
        setSetting(TELEGRAM_WEBHOOK_ERROR_KEY, message);
        return NextResponse.json({ error: `Telegram сохранён, но входящие сообщения не подключились: ${message}`, ...snapshot() }, { status: 400 });
      }
    }

    if (typeof body.needNumberProjectId === "string") setSetting(INTEGRATION_KEYS.needNumberProjectId, body.needNumberProjectId.trim() || "1474");
    if (typeof body.needNumberCreateDeal === "boolean") setSetting(INTEGRATION_KEYS.needNumberCreateDeal, body.needNumberCreateDeal ? "1" : "0");

    if (body.clearEmail === true) {
      for (const key of [INTEGRATION_KEYS.emailAddress, INTEGRATION_KEYS.emailUsername, INTEGRATION_KEYS.emailPassword, INTEGRATION_KEYS.emailImapHost, INTEGRATION_KEYS.emailSmtpHost]) setSetting(key, "");
    } else {
      let address = getSetting(INTEGRATION_KEYS.emailAddress) || DEFAULT_EMAIL_ADDRESS;
      if (typeof body.emailAddress === "string") {
        address = body.emailAddress.trim().toLowerCase();
        if (address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
        setSetting(INTEGRATION_KEYS.emailAddress, address || DEFAULT_EMAIL_ADDRESS);
      }

      if (isYandexMailbox(address || DEFAULT_EMAIL_ADDRESS)) {
        setSetting(INTEGRATION_KEYS.emailUsername, typeof body.emailUsername === "string" && body.emailUsername.trim() ? body.emailUsername.trim() : (address || DEFAULT_EMAIL_ADDRESS));
        setSetting(INTEGRATION_KEYS.emailImapHost, YANDEX_IMAP_HOST);
        setSetting(INTEGRATION_KEYS.emailImapPort, "993");
        setSetting(INTEGRATION_KEYS.emailImapSecure, "1");
        setSetting(INTEGRATION_KEYS.emailSmtpHost, YANDEX_SMTP_HOST);
        setSetting(INTEGRATION_KEYS.emailSmtpPort, "465");
        setSetting(INTEGRATION_KEYS.emailSmtpSecure, "1");
        setSetting(INTEGRATION_KEYS.emailFromName, typeof body.emailFromName === "string" && body.emailFromName.trim() ? body.emailFromName.trim() : "Satori Studio");
      } else {
        saveString(body, "emailUsername", INTEGRATION_KEYS.emailUsername);
        saveString(body, "emailImapHost", INTEGRATION_KEYS.emailImapHost);
        savePort(body, "emailImapPort", INTEGRATION_KEYS.emailImapPort);
        if (typeof body.emailImapSecure === "boolean") setSetting(INTEGRATION_KEYS.emailImapSecure, body.emailImapSecure ? "1" : "0");
        saveString(body, "emailSmtpHost", INTEGRATION_KEYS.emailSmtpHost);
        savePort(body, "emailSmtpPort", INTEGRATION_KEYS.emailSmtpPort);
        if (typeof body.emailSmtpSecure === "boolean") setSetting(INTEGRATION_KEYS.emailSmtpSecure, body.emailSmtpSecure ? "1" : "0");
        saveString(body, "emailFromName", INTEGRATION_KEYS.emailFromName);
      }

      if (typeof body.emailPassword === "string" && body.emailPassword.trim()) setSetting(INTEGRATION_KEYS.emailPassword, body.emailPassword.trim());
      saveString(body, "emailIgnoreSenders", INTEGRATION_KEYS.emailIgnoreSenders);
      saveString(body, "emailIgnoreSubjects", INTEGRATION_KEYS.emailIgnoreSubjects);
      if (body.emailSyncDays !== undefined) {
        const days = Math.min(3650, Math.max(1, Number(body.emailSyncDays) || 365));
        setSetting(INTEGRATION_KEYS.emailSyncDays, String(Math.round(days)));
      }
    }

    return NextResponse.json({ success: true, ...snapshot() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось сохранить настройки" }, { status: 400 });
  }
}
