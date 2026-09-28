import { randomUUID } from "node:crypto";

const API_BASE = "https://api.wazzup24.com/v3";
const CACHE_MS = Math.max(5000, Number(process.env.WAZZUP_CHANNEL_CACHE_MS || 60000));
let channelCache = { at: 0, items: [] };

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  return digits;
}

function normalizeTelegram(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^-?\d+$/.test(raw)) return raw;
  const match = raw.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]+)/i);
  if (match) return `@${match[1]}`;
  return raw;
}

export function wazzupConfigured() {
  return Boolean(String(process.env.WAZZUP_API_KEY || "").trim());
}

function authHeaders(extra = {}) {
  const key = String(process.env.WAZZUP_API_KEY || "").trim();
  if (!key) throw new Error("WAZZUP_API_KEY не задан на сервере");
  return { Authorization: `Bearer ${key}`, ...extra };
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: authHeaders({
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const message = data?.description || data?.error?.message || data?.error || `Wazzup HTTP ${response.status}`;
    throw new Error(String(message));
  }
  return data;
}

export async function listWazzupChannels({ force = false } = {}) {
  if (!wazzupConfigured()) return [];
  if (!force && Date.now() - channelCache.at < CACHE_MS) return channelCache.items;
  const data = await request("/channels");
  const items = Array.isArray(data) ? data : [];
  channelCache = { at: Date.now(), items };
  return items;
}

function transportMatches(chatType, transport) {
  if (chatType === "whatsapp") return transport === "whatsapp" || transport === "wapi";
  if (chatType === "telegram") return transport === "tgapi" || transport === "telegram";
  return transport === chatType;
}

export async function resolveWazzupChannel(chatType) {
  const preferred = chatType === "whatsapp"
    ? String(process.env.WAZZUP_WHATSAPP_CHANNEL_ID || "").trim()
    : chatType === "telegram"
      ? String(process.env.WAZZUP_TELEGRAM_CHANNEL_ID || "").trim()
      : "";
  const channels = await listWazzupChannels();
  if (preferred) {
    const exact = channels.find((item) => item.channelId === preferred);
    if (!exact) throw new Error(`Wazzup: канал ${preferred} не найден`);
    if (exact.state !== "active") throw new Error(`Wazzup: канал ${exact.plainId || preferred} не активен (${exact.state || "unknown"})`);
    return exact;
  }
  const active = channels.find((item) => item.state === "active" && transportMatches(chatType, item.transport));
  if (!active) throw new Error(`Wazzup: нет активного канала ${chatType}`);
  return active;
}

export async function sendWazzupText({ chatType, chatId, phone, username, text, clearUnanswered = false, crmMessageId }) {
  if (!wazzupConfigured()) throw new Error("Wazzup не подключён");
  const channel = await resolveWazzupChannel(chatType);
  const body = {
    channelId: channel.channelId,
    chatType,
    text: String(text || ""),
    clearUnanswered: Boolean(clearUnanswered),
    crmMessageId: String(crmMessageId || randomUUID()),
  };

  if (chatType === "whatsapp") {
    const recipient = normalizePhone(chatId || phone);
    if (!recipient) throw new Error("У клиента не указан номер WhatsApp");
    body.chatId = recipient;
  } else if (chatType === "telegram") {
    const normalizedChat = normalizeTelegram(chatId);
    if (normalizedChat && /^-?\d+$/.test(normalizedChat)) body.chatId = normalizedChat;
    else if (username) body.username = normalizeTelegram(username).replace(/^@/, "");
    else if (phone) body.phone = normalizePhone(phone);
    else throw new Error("Для Telegram через Wazzup нужен chatId, username или телефон");
  } else {
    if (!chatId) throw new Error("Не указан получатель");
    body.chatId = String(chatId);
  }

  const data = await request("/message", { method: "POST", body: JSON.stringify(body) });
  return {
    mode: "api",
    provider: "wazzup",
    messageId: data?.messageId || null,
    chatId: data?.chatId || body.chatId || "",
    channelId: channel.channelId,
    transport: channel.transport,
  };
}

export async function getWazzupWebhook() {
  if (!wazzupConfigured()) return null;
  return request("/webhooks");
}

export async function configureWazzupWebhook(url) {
  if (!wazzupConfigured()) throw new Error("WAZZUP_API_KEY не задан на сервере");
  const webhookUrl = String(url || process.env.WAZZUP_WEBHOOK_URL || "").trim();
  if (!webhookUrl) throw new Error("Не задан WAZZUP_WEBHOOK_URL");
  return request("/webhooks", {
    method: "PATCH",
    body: JSON.stringify({
      webhooksUri: webhookUrl,
      subscriptions: {
        messagesAndStatuses: true,
        contactsAndDealsCreation: false,
        channelsUpdates: true,
        templateStatus: false,
      },
    }),
  });
}

export function verifyWazzupWebhook(req) {
  const expected = String(process.env.WAZZUP_WEBHOOK_SECRET || "").trim();
  if (!expected) return true;
  return String(req.query?.secret || "") === expected;
}

export function parseWazzupWebhook(body) {
  if (body?.test === true) return [];
  const items = [];
  for (const message of body?.messages || []) {
    if (!message || message.isDeleted) continue;
    const chatType = String(message.chatType || "");
    if (chatType !== "whatsapp" && chatType !== "telegram") continue;
    const direction = message.status === "inbound" || message.isEcho === false ? "inbound" : "outbound";
    const contactPhone = normalizePhone(message.contact?.phone || (chatType === "whatsapp" ? message.chatId : ""));
    const contactUsername = message.contact?.username ? `@${String(message.contact.username).replace(/^@/, "")}` : "";
    const text = String(message.text || "").trim() || (message.contentUri ? `[${message.type || "файл"}] ${message.contentUri}` : "");
    items.push({
      channel: chatType,
      provider: "wazzup",
      direction,
      externalId: String(message.messageId || ""),
      from: direction === "inbound" ? String(message.chatId || contactPhone || contactUsername) : "",
      to: direction === "outbound" ? String(message.chatId || contactPhone || contactUsername) : "",
      phone: contactPhone,
      telegram: chatType === "telegram" ? (contactUsername || String(message.chatId || "")) : "",
      username: contactUsername,
      name: String(message.contact?.name || message.authorName || ""),
      text,
      status: String(message.status || ""),
      channelId: String(message.channelId || ""),
      createdAt: message.dateTime ? new Date(message.dateTime).toISOString() : new Date().toISOString(),
    });
  }
  return items;
}

export async function getWazzupStatus() {
  if (!wazzupConfigured()) return { configured: false, channels: [], active: 0, webhookConnected: false };
  const channels = await listWazzupChannels({ force: true });
  let webhookConnected = false;
  try {
    const webhook = await getWazzupWebhook();
    webhookConnected = Boolean(webhook?.webhooksUri);
  } catch {}
  return {
    configured: true,
    channels: channels.map((item) => ({
      channelId: item.channelId,
      transport: item.transport,
      plainId: item.plainId,
      state: item.state,
    })),
    active: channels.filter((item) => item.state === "active").length,
    webhookConnected,
  };
}
