import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getSetting,
  setSetting,
  telegramApiRequest,
} from "@/lib/satori-integrations";

const WEBHOOK_SECRET_KEY = "satori_telegram_webhook_secret";
const WEBHOOK_ENABLED_KEY = "satori_telegram_webhook_enabled";
const WEBHOOK_URL_KEY = "satori_telegram_webhook_url";

function externalOrigin(request: NextRequest): string {
  const configured = process.env.CRM_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (configured && /^https:\/\//i.test(configured)) return configured;
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "crm.satorilabural.online";
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
    return "https://crm.satorilabural.online";
  }
  return `${proto}://${host}`;
}

function ensureSecret(): string {
  const existing = getSetting(WEBHOOK_SECRET_KEY);
  if (existing && existing.length >= 24) return existing;
  const value = randomBytes(24).toString("hex");
  setSetting(WEBHOOK_SECRET_KEY, value);
  return value;
}

export async function POST(request: NextRequest) {
  const token = getSetting("satori_telegram_bot_token");
  if (!token) {
    return NextResponse.json({ error: "Сначала сохрани токен Telegram-бота" }, { status: 400 });
  }

  const secret = ensureSecret();
  const url = `${externalOrigin(request)}/api/integrations/telegram/webhook`;

  try {
    const result = await telegramApiRequest(token, "setWebhook", {
      url,
      secret_token: secret,
      allowed_updates: ["message", "edited_message"],
      drop_pending_updates: false,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.description || "Telegram не принял webhook" },
        { status: 400 }
      );
    }

    const info = await telegramApiRequest<{
      url?: string;
      pending_update_count?: number;
      last_error_message?: string;
    }>(token, "getWebhookInfo", {});

    setSetting(WEBHOOK_ENABLED_KEY, "1");
    setSetting(WEBHOOK_URL_KEY, url);

    return NextResponse.json({
      success: true,
      webhookUrl: info.result?.url || url,
      pendingUpdates: info.result?.pending_update_count || 0,
      lastError: info.result?.last_error_message || "",
    });
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
    setSetting(WEBHOOK_ENABLED_KEY, "0");
    setSetting(WEBHOOK_URL_KEY, "");
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось отключить webhook" },
      { status: 500 }
    );
  }
}
