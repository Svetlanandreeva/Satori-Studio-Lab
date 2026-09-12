import { NextResponse } from "next/server";
import { listEmailThreads } from "@/lib/email-integration";
import { listTelegramThreads } from "@/lib/telegram-inbox";

export const dynamic = "force-dynamic";

export async function GET() {
  const emailThreads = listEmailThreads("all");
  const telegramThreads = listTelegramThreads();

  const telegram = telegramThreads.reduce(
    (sum, thread) => sum + Math.max(0, Number(thread.unreadCount || 0)),
    0
  );
  const email = emailThreads
    .filter((thread) => !thread.isService)
    .reduce((sum, thread) => sum + Math.max(0, Number(thread.unreadCount || 0)), 0);
  const service = emailThreads
    .filter((thread) => thread.isService)
    .reduce((sum, thread) => sum + Math.max(0, Number(thread.unreadCount || 0)), 0);

  return NextResponse.json({
    all: telegram + email + service,
    telegram,
    email,
    service,
  });
}
