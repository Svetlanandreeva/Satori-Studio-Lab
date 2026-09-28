import { NextResponse } from "next/server";
import { db } from "@/db";
import { emailMessages } from "@/db/schema";
import { listTelegramThreads } from "@/lib/telegram-inbox";
import { getMessageIndicatorsStartedAt } from "@/lib/message-indicator-state";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = getMessageIndicatorsStartedAt();
  const telegramThreads = listTelegramThreads();

  const telegram = telegramThreads.reduce(
    (sum, thread) => sum + Math.max(0, Number(thread.unreadCount || 0)),
    0
  );

  let email = 0;
  let service = 0;
  for (const message of db.select().from(emailMessages).all()) {
    if (
      message.direction !== "incoming" ||
      message.isRead ||
      message.receivedAt.getTime() <= startedAt.getTime()
    ) continue;
    if (message.isService) service += 1;
    else email += 1;
  }

  return NextResponse.json({
    all: telegram + email + service,
    telegram,
    email,
    service,
  });
}
