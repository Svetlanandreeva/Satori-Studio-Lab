import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts, deals, pipelineStages } from "@/db/schema";
import {
  INTEGRATION_KEYS,
  escapeTelegramHtml,
  getSetting,
  normalizeRussianPhone,
  phoneIdentity,
  safeSecretEqual,
  sendTelegramMessage,
  setSetting,
  telegramApiRequest,
} from "@/lib/satori-integrations";

const WEBHOOK_SECRET_KEY = "satori_telegram_webhook_secret";
const LAST_UPDATE_AT_KEY = "satori_telegram_last_update_at";
const LAST_UPDATE_TYPE_KEY = "satori_telegram_last_update_type";

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
  sender_business_bot?: TelegramUser;
  business_connection_id?: string;
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

interface TelegramBusinessConnection {
  id: string;
  user: TelegramUser;
  user_chat_id?: number;
  is_enabled: boolean;
  rights?: {
    can_reply?: boolean;
    can_read_messages?: boolean;
  };
}

interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  business_connection?: TelegramBusinessConnection;
  business_message?: TelegramMessage;
  edited_business_message?: TelegramMessage;
  deleted_business_messages?: {
    business_connection_id: string;
    chat?: TelegramChat;
    message_ids?: number[];
  };
}

function updateType(update: TelegramUpdate): string {
  if (update.business_connection) return "business_connection";
  if (update.business_message) return "business_message";
  if (update.edited_business_message) return "edited_business_message";
  if (update.deleted_business_messages) return "deleted_business_messages";
  if (update.message) return "message";
  if (update.edited_message) return "edited_message";
  return "unknown";
}

function markWebhookReceipt(update: TelegramUpdate) {
  setSetting(LAST_UPDATE_AT_KEY, new Date().toISOString());
  setSetting(LAST_UPDATE_TYPE_KEY, updateType(update));
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

function displayName(message: TelegramMessage, preferChat = false): string {
  const user = preferChat ? undefined : message.from;
  const parts = [
    user?.first_name || message.chat.first_name,
    user?.last_name || message.chat.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (parts) return parts;
  const username = preferChat ? message.chat.username : user?.username || message.chat.username;
  if (username) return `@${username}`;
  return `Telegram ${message.chat.id}`;
}

function usernameOf(message: TelegramMessage, preferChat = false): string | null {
  const value = preferChat ? message.chat.username : message.from?.username || message.chat.username;
  return value ? `@${value}` : null;
}

function bodyOf(message: TelegramMessage): string {
  if (message.text?.trim()) return message.text.trim();
  if (message.caption?.trim()) return message.caption.trim();
  if (message.contact) {
    const who = [message.contact.first_name, message.contact.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    return `📇 Контакт${who ? `: ${who}` : ""}${
      message.contact.phone_number ? ` · ${message.contact.phone_number}` : ""
    }`;
  }
  if (message.document) {
    return `📎 Документ${message.document.file_name ? `: ${message.document.file_name}` : ""}`;
  }
  if (message.photo?.length) return "🖼 Фото";
  if (message.voice) return "🎤 Голосовое сообщение";
  if (message.video) return "🎬 Видео";
  if (message.audio) return "🎵 Аудио";
  if (message.sticker) return `🙂 Стикер${message.sticker.emoji ? ` ${message.sticker.emoji}` : ""}`;
  if (message.location) return "📍 Геолокация";
  return "Сообщение Telegram";
}

function telegramUserFromNotes(notes: string | null): string | null {
  const match = String(notes || "").match(/\[telegram-user:([^\]]+)\]/i);
  return match?.[1] || null;
}

function withTelegramMeta(
  notes: string | null,
  input: {
    chatId: string;
    username: string | null;
    messageId: number;
    businessConnectionId?: string | null;
  }
): string {
  const preservedUser = input.username || telegramUserFromNotes(notes);
  const lines = String(notes || "")
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("[telegram-chat:") &&
        !line.startsWith("[telegram-user:") &&
        !line.startsWith("[telegram-last-message:") &&
        !line.startsWith("[telegram-business:")
    );
  lines.push(`[telegram-chat:${input.chatId}]`);
  if (input.businessConnectionId) {
    lines.push(`[telegram-business:${input.businessConnectionId}]`);
  }
  if (preservedUser) lines.push(`[telegram-user:${preservedUser.toLowerCase()}]`);
  lines.push(`[telegram-last-message:${input.chatId}:${input.messageId}]`);
  return lines.filter(Boolean).join("\n");
}

function hasChat(notes: string | null, chatId: string): boolean {
  return String(notes || "").includes(`[telegram-chat:${chatId}]`);
}

function hasUsername(notes: string | null, username: string | null): boolean {
  if (!username) return false;
  return String(notes || "")
    .toLowerCase()
    .includes(`[telegram-user:${username.toLowerCase()}]`);
}

function alreadyProcessed(notes: string | null, chatId: string, messageId: number): boolean {
  return String(notes || "").includes(`[telegram-last-message:${chatId}:${messageId}]`);
}

function saveBusinessConnection(connection: TelegramBusinessConnection) {
  setSetting(INTEGRATION_KEYS.telegramBusinessConnectionId, connection.id);
  setSetting(INTEGRATION_KEYS.telegramBusinessUserId, String(connection.user.id));
  setSetting(INTEGRATION_KEYS.telegramBusinessEnabled, connection.is_enabled ? "1" : "0");
  setSetting(
    INTEGRATION_KEYS.telegramBusinessCanReply,
    connection.rights?.can_reply ? "1" : "0"
  );
  setSetting(
    "satori_telegram_business_can_read_messages",
    connection.rights?.can_read_messages ? "1" : "0"
  );
}

async function resolveBusinessOwner(connectionId: string): Promise<string> {
  const storedId = getSetting(INTEGRATION_KEYS.telegramBusinessConnectionId);
  const storedUserId = getSetting(INTEGRATION_KEYS.telegramBusinessUserId) || "";
  if (storedId === connectionId && storedUserId) return storedUserId;

  const token = getSetting(INTEGRATION_KEYS.telegramBotToken);
  if (!token) return storedUserId;
  try {
    const response = await telegramApiRequest<TelegramBusinessConnection>(
      token,
      "getBusinessConnection",
      { business_connection_id: connectionId }
    );
    if (response.ok && response.result) {
      saveBusinessConnection(response.result);
      return String(response.result.user.id);
    }
  } catch {}
  return storedUserId;
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

  // Record only event type/time before any CRM filtering. No message text is stored here.
  markWebhookReceipt(update);

  if (update.business_connection) {
    saveBusinessConnection(update.business_connection);
    return NextResponse.json({
      ok: true,
      businessConnection: update.business_connection.is_enabled ? "connected" : "disabled",
    });
  }

  if (update.deleted_business_messages) {
    return NextResponse.json({ ok: true, deletedBusinessMessages: true });
  }

  const businessMessage = update.business_message || update.edited_business_message;
  const message = businessMessage || update.message || update.edited_message;
  const isBusiness = Boolean(businessMessage?.business_connection_id);

  if (!message || message.chat?.type !== "private" || message.from?.is_bot) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const chatId = String(message.chat.id);
  const ownerChatId = getSetting(INTEGRATION_KEYS.telegramChatId) || "";
  if (!isBusiness && ownerChatId && chatId === ownerChatId) {
    return NextResponse.json({ ok: true, ignored: "owner-chat" });
  }

  const businessConnectionId = isBusiness ? message.business_connection_id || "" : "";
  const businessOwnerUserId = businessConnectionId
    ? await resolveBusinessOwner(businessConnectionId)
    : "";
  const fromOwner = Boolean(
    isBusiness && businessOwnerUserId && String(message.from?.id || "") === businessOwnerUserId
  );

  // For outgoing Business messages message.from is the Satori account itself,
  // while message.chat is the customer. Use the chat identity so a conversation
  // started in the Telegram app is also created and visible in CRM.
  const username = usernameOf(message, fromOwner);
  const sharedPhone = fromOwner ? null : normalizeRussianPhone(message.contact?.phone_number);
  const phoneKey = phoneIdentity(sharedPhone);
  const allContacts = db.select().from(contacts).all();

  let contact = allContacts.find((item) => hasChat(item.notes, chatId));
  if (!contact && username) {
    contact = allContacts.find((item) => hasUsername(item.notes, username));
  }
  if (!contact && phoneKey) {
    contact = allContacts.find((item) => phoneIdentity(item.phone) === phoneKey);
  }

  if (contact && alreadyProcessed(contact.notes, chatId, message.message_id)) {
    return NextResponse.json({ ok: true, duplicate: true, contactId: contact.id });
  }

  const now = new Date();
  const notes = withTelegramMeta(contact?.notes || null, {
    chatId,
    username,
    messageId: message.message_id,
    businessConnectionId: businessConnectionId || null,
  });

  if (!contact) {
    contact = db
      .insert(contacts)
      .values({
        name: displayName(message, fromOwner),
        email: null,
        phone: sharedPhone,
        company: null,
        source: isBusiness ? "telegram_account" : "telegram",
        temperature: "warm",
        qualification: "new",
        score: 55,
        notes: [isBusiness ? "Источник: личный Telegram" : "Источник: Telegram-бот", notes]
          .filter(Boolean)
          .join("\n"),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  } else {
    db.update(contacts)
      .set({
        phone: contact.phone || sharedPhone || null,
        notes,
        updatedAt: now,
      })
      .where(eq(contacts.id, contact.id))
      .run();
  }

  const body = bodyOf(message);
  const channelLabel = isBusiness ? "Telegram аккаунт" : "Telegram бот";
  const direction = fromOwner ? "исходящее" : "входящее";
  const sender = fromOwner ? "Satori" : username || displayName(message);

  db.insert(activities)
    .values({
      type: isBusiness
        ? fromOwner
          ? "telegram_business_outgoing"
          : "telegram_business_incoming"
        : "telegram_incoming",
      description: `${channelLabel} · ${direction}${fromOwner ? "" : ` · ${sender}`}\n${body}`,
      contactId: contact.id,
      createdAt: message.date ? new Date(message.date * 1000) : now,
    })
    .run();

  // Outgoing messages written in the Telegram app are mirrored into CRM, but
  // they should not create a sales deal by themselves or trigger a notification.
  if (fromOwner) {
    return NextResponse.json({ ok: true, contactId: contact.id, outgoing: true });
  }

  const activeDeals = db
    .select({ deal: deals, stage: pipelineStages })
    .from(deals)
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .all()
    .filter((row) => row.deal.contactId === contact.id && !row.stage.isWon && !row.stage.isLost);

  let newDealId: string | null = null;
  if (!activeDeals.length && !body.startsWith("/")) {
    const firstStage = db
      .select()
      .from(pipelineStages)
      .orderBy(asc(pipelineStages.order))
      .all()
      .find((stage) => !stage.isWon && !stage.isLost && !/песоч/i.test(stage.name));
    if (firstStage) {
      const createdDeal = db
        .insert(deals)
        .values({
          title: `Telegram · ${displayName(message)}`,
          value: 0,
          stageId: firstStage.id,
          contactId: contact.id,
          probability: 20,
          notes: `${isBusiness ? "Источник: личный Telegram" : "Источник: Telegram-бот"}${
            username ? `\nПользователь: ${username}` : ""
          }`,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      newDealId = createdDeal.id;
    }
  }

  // The admin bot is an alert channel, not a copy of every conversation.
  // Notify only when this inbound message actually creates a new CRM application/deal.
  if (newDealId) {
    const contactUrl = `${externalOrigin(request)}/contacts/${contact.id}`;
    await sendTelegramMessage({
      text: [
        isBusiness
          ? "🟢 <b>Новая заявка из личного Telegram</b>"
          : "🟢 <b>Новая заявка из Telegram-бота</b>",
        `От: ${escapeTelegramHtml(displayName(message))}${
          username ? ` (${escapeTelegramHtml(username)})` : ""
        }`,
        `Первое сообщение: ${escapeTelegramHtml(body.slice(0, 1200))}`,
      ].join("\n"),
      url: contactUrl,
    });
  }

  return NextResponse.json({
    ok: true,
    contactId: contact.id,
    business: isBusiness,
    dealId: newDealId,
    adminNotified: Boolean(newDealId),
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    integration: "Telegram Bot + Telegram Business → SATORI CRM",
  });
}
