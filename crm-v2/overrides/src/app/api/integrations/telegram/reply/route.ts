import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { sendTelegramMessage } from "@/lib/satori-integrations";

function telegramMeta(notes: string | null) {
  const raw = String(notes || "");
  return {
    chatId: raw.match(/\[telegram-chat:([^\]]+)\]/)?.[1] || null,
    businessConnectionId: raw.match(/\[telegram-business:([^\]]+)\]/)?.[1] || null,
  };
}

export async function POST(request: NextRequest) {
  let body: { contactId?: string; text?: string };
  try {
    body = (await request.json()) as { contactId?: string; text?: string };
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const contactId = String(body.contactId || "").trim();
  const text = String(body.text || "").trim();
  if (!contactId || !text) {
    return NextResponse.json({ error: "Нужны contactId и текст сообщения" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "Сообщение слишком длинное" }, { status: 400 });
  }

  const contact = db.select().from(contacts).where(eq(contacts.id, contactId)).get();
  if (!contact) return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });

  const meta = telegramMeta(contact.notes);
  if (!meta.chatId) {
    return NextResponse.json({ error: "У клиента нет Telegram-чата" }, { status: 400 });
  }

  const sent = await sendTelegramMessage({
    text,
    chatId: meta.chatId,
    businessConnectionId: meta.businessConnectionId,
  });
  if (!sent.sent) {
    return NextResponse.json({ error: sent.error || "Telegram не отправил сообщение" }, { status: 400 });
  }

  db.insert(activities)
    .values({
      type: meta.businessConnectionId ? "telegram_business_outgoing" : "telegram_outgoing",
      description: `${meta.businessConnectionId ? "Telegram аккаунт" : "Telegram бот"} · исходящее\n${text}`,
      contactId,
      createdAt: new Date(),
    })
    .run();

  return NextResponse.json({
    success: true,
    channel: meta.businessConnectionId ? "telegram_account" : "telegram_bot",
  });
}
