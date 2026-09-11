import { NextRequest, NextResponse } from "next/server";
import {
  INTEGRATION_KEYS,
  ensureNeedNumberSecret,
  getBooleanSetting,
  getSetting,
  setSetting,
} from "@/lib/satori-integrations";

function snapshot() {
  const secret = ensureNeedNumberSecret();
  const telegramToken = getSetting(INTEGRATION_KEYS.telegramBotToken);
  const telegramChatId = getSetting(INTEGRATION_KEYS.telegramChatId) || "";
  const projectId = getSetting(INTEGRATION_KEYS.needNumberProjectId) || "1474";
  const createDeal = getBooleanSetting(INTEGRATION_KEYS.needNumberCreateDeal, true);

  return {
    telegramConfigured: Boolean(telegramToken && telegramChatId),
    telegramTokenConfigured: Boolean(telegramToken),
    telegramChatId,
    needNumberProjectId: projectId,
    needNumberCreateDeal: createDeal,
    needNumberWebhookPath: `/api/integrations/need-number?key=${encodeURIComponent(secret)}`,
  };
}

export async function GET() {
  return NextResponse.json(snapshot());
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (body.clearTelegram === true) {
    setSetting(INTEGRATION_KEYS.telegramBotToken, "");
    setSetting(INTEGRATION_KEYS.telegramChatId, "");
  } else {
    if (typeof body.telegramBotToken === "string" && body.telegramBotToken.trim()) {
      const token = body.telegramBotToken.trim();
      if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
        return NextResponse.json(
          { error: "Токен Telegram-бота выглядит некорректно" },
          { status: 400 }
        );
      }
      setSetting(INTEGRATION_KEYS.telegramBotToken, token);
    }
    if (typeof body.telegramChatId === "string") {
      setSetting(INTEGRATION_KEYS.telegramChatId, body.telegramChatId.trim());
    }
  }

  if (typeof body.needNumberProjectId === "string") {
    setSetting(
      INTEGRATION_KEYS.needNumberProjectId,
      body.needNumberProjectId.trim() || "1474"
    );
  }
  if (typeof body.needNumberCreateDeal === "boolean") {
    setSetting(
      INTEGRATION_KEYS.needNumberCreateDeal,
      body.needNumberCreateDeal ? "1" : "0"
    );
  }

  return NextResponse.json({ success: true, ...snapshot() });
}
