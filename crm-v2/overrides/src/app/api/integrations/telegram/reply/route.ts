import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { sendTelegramMessage } from "@/lib/satori-integrations";
import { sendTelegramDocument } from "@/lib/telegram-send-document";
import { saveClientDocument } from "@/lib/client-documents";

function telegramMeta(notes: string | null) {
  const raw = String(notes || "");
  return {
    chatId: raw.match(/\[telegram-chat:([^\]]+)\]/)?.[1] || null,
    businessConnectionId: raw.match(/\[telegram-business:([^\]]+)\]/)?.[1] || null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const type = String(request.headers.get("content-type") || "");
    let contactId = "";
    let text = "";
    let file: File | null = null;

    if (type.includes("multipart/form-data")) {
      const form = await request.formData();
      contactId = String(form.get("contactId") || "").trim();
      text = String(form.get("text") || "").trim();
      const rawFile = form.get("file");
      file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;
    } else {
      const body = await request.json().catch(() => ({})) as { contactId?: string; text?: string };
      contactId = String(body.contactId || "").trim();
      text = String(body.text || "").trim();
    }

    if (!contactId || (!text && !file)) return NextResponse.json({ error: "Нужны contactId и сообщение или файл" }, { status: 400 });
    if (text.length > 4000) return NextResponse.json({ error: "Сообщение слишком длинное" }, { status: 400 });
    if (file && file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "Максимальный размер файла 20 МБ" }, { status: 400 });

    const contact = db.select().from(contacts).where(eq(contacts.id, contactId)).get();
    if (!contact) return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
    const meta = telegramMeta(contact.notes);
    if (!meta.chatId) return NextResponse.json({ error: "У клиента нет Telegram-чата" }, { status: 400 });

    let remoteMessageId: string | number | null = null;
    if (file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sent = await sendTelegramDocument({ chatId: meta.chatId, filename: file.name || "file", bytes, mimeType: file.type || null, caption: text || null, businessConnectionId: meta.businessConnectionId });
      if (!sent.sent) return NextResponse.json({ error: sent.error || "Telegram не отправил файл" }, { status: 400 });
      remoteMessageId = sent.messageId || null;
      const sourceMessageId = `telegram-out:${remoteMessageId || crypto.randomUUID()}`;
      try {
        saveClientDocument({ contactId, name: file.name || "file", mimeType: file.type || null, bytes, sourceChannel: "telegram", sourceMessageId, sourceAttachmentId: "out:0", sourceDirection: "outgoing", createdAt: new Date() });
      } catch (error) { console.error("Failed to save outgoing Telegram attachment", error); }
    } else {
      const sent = await sendTelegramMessage({ text, chatId: meta.chatId, businessConnectionId: meta.businessConnectionId, parseMode: null });
      if (!sent.sent) return NextResponse.json({ error: sent.error || "Telegram не отправил сообщение" }, { status: 400 });
    }

    const bodyText = [text, file ? `📎 ${file.name}` : ""].filter(Boolean).join("\n");
    db.insert(activities).values({
      type: meta.businessConnectionId ? "telegram_business_outgoing" : "telegram_outgoing",
      description: `${meta.businessConnectionId ? "Telegram аккаунт" : "Telegram бот"} · исходящее\n${bodyText}`,
      contactId,
      createdAt: new Date(),
    }).run();

    return NextResponse.json({ success: true, channel: meta.businessConnectionId ? "telegram_account" : "telegram_bot", attachment: Boolean(file), messageId: remoteMessageId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось отправить в Telegram" }, { status: 400 });
  }
}
