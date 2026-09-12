import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/satori-integrations";

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
  const result = await sendTelegramMessage({
    text: "✅ <b>SATORI CRM</b>\nTelegram подключён. Уведомления о новых лидах Need Number будут приходить сюда.",
    url: `${externalOrigin(request)}/settings`,
  });

  if (!result.sent) {
    return NextResponse.json(
      { error: result.error || "Не удалось отправить тестовое сообщение" },
      { status: 400 }
    );
  }
  return NextResponse.json({ success: true });
}
