import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts, deals, pipelineStages } from "@/db/schema";
import {
  escapeTelegramHtml,
  getSetting,
  normalizeRussianPhone,
  phoneIdentity,
  safeSecretEqual,
  sendTelegramMessage,
} from "@/lib/satori-integrations";

const WEBHOOK_SECRET_KEY = "satori_telegram_webhook_secret";

interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  date?: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  photo?: unknown[];
  document?: { file_name?: string };
  voice?: unknown;
  video?: unknown;
  audio?: unknown;
  sticker?: { emoji?: string };
  contact?: { phone_number?: string; first_name?: string; last_name?: string };
  location?: unknown;
}

interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

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

function displayName(message: TelegramMessage): string {
  const user = message.from;
  const parts = [user?.first_name || message.chat.first_name, user?.last_name || message.chat.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (parts) return parts;
  const username = user?.username || message.chat.username;
  if (username) return `@${username}`;
  return `Telegram ${message.chat.id}`;
}

function usernameOf(message: TelegramMessage): string | null {
  const value = message.from?.username || message.chat.username;
  return value ? `@${value}` : null;
}

function bodyOf(message: TelegramMessage): string {
  if (message.text?.trim()) return message.text.trim();
  if (message.caption?.trim()) return message.caption.trim();
  if (message.contact) {
    const who = [message.contact.first_name, message.contact.last_name].filter(Boolean).join(" ").trim();
    return `📇 Контакт${who ? `: ${who}` : ""}${message.contact.phone_number ? ` · ${message.contact.phone_number}` : ""}`;
  }
  if (message.document) return `📎 Документ${message.document.file_name ? `: ${message.document.file_name}` : ""}`;
  if (message.photo?.length) return "🖼 Фото";
  if (message.voice) return "🎤 Голосовое сообщение";
  if (message.video) return "🎬 Видео";
  if (message.audio) return "🎵 Аудио";
  if (message.sticker) return `🙂 Стикер${message.sticker.emoji ? ` ${message.sticker.emoji}` : ""}`;
  if (message.location) return "📍 Геолокация";
  return "Сообщение Telegram";
}

function withTelegramMeta(
  notes: string | null,
  input: { chatId: string; username: string | null; messageId: number }
): string {
  const lines = String(notes || "")
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("[telegram-chat:") &&
        !line.startsWith("[telegram-user:") &&
        !line.startsWith("[telegram-last-message:")
    );
  lines.push(`[telegram-chat:${input.chatId}]`);
  if (input.username) lines.push(`[telegram-user:${input.username.toLowerCase()}]`);
  lines.push(`[telegram-last-message:${input.chatId}:${input.messageId}]`);
  return lines.filter(Boolean).join("\n");
}

function hasChat(notes: string | null, chatId: string): boolean {
  return String(notes || "").includes(`[telegram-chat:${chatId}]`);
}

function hasUsername(notes: string | null, username: string | null): boolean {
  if (!username) return false;
  return String(notes || "").toLowerCase().includes(`[telegram-user:${username.toLowerCase()}]`);
}

function alreadyProcessed(notes: string | null, chatId: string, messageId: number): boolean {
  return String(notes || "").includes(`[telegram-last-message:${chatId}:${messageId}]`);
}

export async function POST(request: NextRequest) {
  const expectedSecret = getSetting(WEBHOOK_SECRET_KEY);
  const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!expectedSecret || !safeSecretEqual(receivedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Telegram webhook secret mismatch" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = update.message || update.edited_message;
  if (!message || message.chat?.type !== "private" || message.from?.is_bot) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const chatId = String(message.chat.id);
  const ownerChatId = getSetting("satori_telegram_chat_id") || "";
  if (ownerChatId && chatId === ownerChatId) {
    return NextResponse.json({ ok: true, ignored: "owner-chat" });
  }

  const username = usernameOf(message);
  const sharedPhone = normalizeRussianPhone(message.contact?.phone_number);
  const phoneKey = phoneIdentity(sharedPhone);
  const allContacts = db.select().from(contacts).all();

  let contact = allContacts.find((item) => hasChat(item.notes, chatId));
  if (!contact && username) contact = allContacts.find((item) => hasUsername(item.notes, username));
  if (!contact && phoneKey) contact = allContacts.find((item) => phoneIdentity(item.phone) === phoneKey);

  if (contact && alreadyProcessed(contact.notes, chatId, message.message_id)) {
    return NextResponse.json({ ok: true, duplicate: true, contactId: contact.id });
  }

  const now = new Date();
  const notes = withTelegramMeta(contact?.notes || null, {
    chatId,
    username,
    messageId: message.message_id,
  });

  if (!contact) {
    contact = db
      .insert(contacts)
      .values({
        name: displayName(message),
        email: null,
        phone: sharedPhone,
        company: null,
        source: "telegram",
        temperature: "warm",
        qualification: "new",
        score: 55,
        notes: ["Источник: Telegram", notes].filter(Boolean).join("\n"),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  } else {
    db.update(contacts)
      .set({
        name: contact.name || displayName(message),
        phone: contact.phone || sharedPhone || null,
        notes,
        updatedAt: now,
      })
      .where((await import("drizzle-orm")).eq(contacts.id, contact.id))
      .run();
  }

  const sender = username || displayName(message);
  const body = bodyOf(message);
  db.insert(activities)
    .values({
      type: "telegram_incoming",
      description: `Telegram · ${sender}\n${body}`,
      contactId: contact.id,
      createdAt: message.date ? new Date(message.date * 1000) : now,
    })
    .run();

  const activeDeals = db
    .select({ deal: deals, stage: pipelineStages })
    .from(deals)
    .innerJoin(pipelineStages, (await import("drizzle-orm")).eq(deals.stageId, pipelineStages.id))
    .all()
    .filter((row) => row.deal.contactId === contact.id && !row.stage.isWon && !row.stage.isLost);

  if (!activeDeals.length && !body.startsWith("/")) {
    const firstStage = db
      .select()
      .from(pipelineStages)
      .orderBy(asc(pipelineStages.order))
      .all()
      .find((stage) => !stage.isWon && !stage.isLost && !/песоч/i.test(stage.name));
    if (firstStage) {
      db.insert(deals)
        .values({
          title: `Telegram · ${displayName(message)}`,
          value: 0,
          stageId: firstStage.id,
          contactId: contact.id,
          probability: 20,
          notes: `Источник: Telegram${username ? `\nПользователь: ${username}` : ""}`,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  }

  const contactUrl = `${externalOrigin(request)}/contacts/${contact.id}`;
  await sendTelegramMessage({
    text: [
      "💬 <b>Новое сообщение Telegram</b>",
      `От: ${escapeTelegramHtml(displayName(message))}${username ? ` (${escapeTelegramHtml(username)})` : ""}`,
      `Сообщение: ${escapeTelegramHtml(body.slice(0, 1200))}`,
    ].join("\n"),
    url: contactUrl,
  });

  return NextResponse.json({ ok: true, contactId: contact.id });
}

export async function GET() {
  return NextResponse.json({ ok: true, integration: "Telegram → SATORI CRM" });
}
