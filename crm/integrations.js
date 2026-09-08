function graphVersion() {
  return process.env.WHATSAPP_GRAPH_VERSION || "v26.0";
}

export function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  return digits;
}

export function normalizeTelegram(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^-?\d+$/.test(raw)) return raw;
  const match = raw.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]+)/i);
  if (match) return `@${match[1]}`;
  if (raw.startsWith("@")) return raw;
  return raw;
}

export function integrationStatus() {
  return {
    whatsapp: {
      configured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
      webhookConfigured: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
      graphVersion: graphVersion(),
    },
    telegram: {
      configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      ownerNotifications: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_OWNER_CHAT_ID),
      webhookConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    },
  };
}

export function whatsappOpenUrl(phone, text = "") {
  const to = normalizePhone(phone);
  if (!to) return "";
  return `https://wa.me/${to}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function telegramOpenUrl(contact) {
  const recipient = normalizeTelegram(contact);
  if (!recipient || /^-?\d+$/.test(recipient)) return "";
  return `https://t.me/${recipient.replace(/^@/, "")}`;
}

async function jsonRequest(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false || data?.error) {
    const message = data?.error?.message || data?.description || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function whatsappApiReady() {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendWhatsAppText({ to, text }) {
  if (!whatsappApiReady()) {
    return { mode: "open", url: whatsappOpenUrl(to, text) };
  }
  const phone = normalizePhone(to);
  if (!phone) throw new Error("У клиента не указан номер WhatsApp");
  const data = await jsonRequest(`https://graph.facebook.com/${graphVersion()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "text",
      text: { preview_url: false, body: String(text || "") },
    }),
  });
  return { mode: "api", messageId: data?.messages?.[0]?.id || null };
}

export async function sendWhatsAppTemplate({ to, templateName, languageCode = "ru", parameters = [] }) {
  if (!whatsappApiReady()) throw new Error("WhatsApp Cloud API не подключён на сервере");
  const phone = normalizePhone(to);
  if (!phone) throw new Error("У клиента не указан номер WhatsApp");
  if (!templateName) throw new Error("Не задан WhatsApp template для первого контакта");
  const bodyParameters = parameters.filter((value) => String(value || "").trim()).map((value) => ({ type: "text", text: String(value) }));
  const template = {
    name: templateName,
    language: { code: languageCode },
    ...(bodyParameters.length ? { components: [{ type: "body", parameters: bodyParameters }] } : {}),
  };
  const data = await jsonRequest(`https://graph.facebook.com/${graphVersion()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "template",
      template,
    }),
  });
  return { mode: "api", messageId: data?.messages?.[0]?.id || null };
}

export async function sendTelegramText({ chatId, username, text }) {
  const recipient = normalizeTelegram(chatId || username);
  if (!recipient) throw new Error("У клиента не указан Telegram");

  // Telegram bots cannot reliably initiate a private conversation by @username.
  // For usernames we open Telegram; once a numeric chat_id is known from a webhook,
  // CRM can send directly through the Bot API.
  if (!/^-?\d+$/.test(recipient)) {
    return { mode: "open", url: telegramOpenUrl(username || recipient) };
  }
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("Telegram Bot API ещё не подключён на сервере");
  }

  const data = await jsonRequest(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: recipient, text: String(text || "") }),
  });
  return { mode: "api", messageId: data?.result?.message_id || null };
}

export async function sendOwnerTelegram(text) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_OWNER_CHAT_ID) return { skipped: true };
  return sendTelegramText({ chatId: process.env.TELEGRAM_OWNER_CHAT_ID, text });
}

export function verifyWhatsAppWebhook(query) {
  const mode = String(query?.["hub.mode"] || "");
  const token = String(query?.["hub.verify_token"] || "");
  const challenge = String(query?.["hub.challenge"] || "");
  if (mode === "subscribe" && process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return challenge;
  }
  return null;
}

export function parseWhatsAppWebhook(body) {
  const items = [];
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const profileByWaId = new Map((value.contacts || []).map((c) => [c.wa_id, c.profile?.name || ""]));
      for (const message of value.messages || []) {
        const text = message?.text?.body || message?.button?.text || message?.interactive?.button_reply?.title || message?.interactive?.list_reply?.title || "";
        items.push({
          channel: "whatsapp",
          direction: "inbound",
          externalId: message.id || "",
          from: message.from || "",
          name: profileByWaId.get(message.from) || "",
          text,
          createdAt: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
        });
      }
    }
  }
  return items;
}

export function verifyTelegramWebhook(headers) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;
  return String(headers?.["x-telegram-bot-api-secret-token"] || "") === expected;
}

export function parseTelegramWebhook(body) {
  const message = body?.message || body?.edited_message || body?.business_message || body?.edited_business_message;
  if (!message?.chat?.id) return [];
  const username = message.from?.username ? `@${message.from.username}` : "";
  const name = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ");
  return [{
    channel: "telegram",
    direction: "inbound",
    externalId: String(message.message_id || ""),
    from: String(message.chat.id),
    username,
    name,
    text: message.text || message.caption || "",
    createdAt: message.date ? new Date(Number(message.date) * 1000).toISOString() : new Date().toISOString(),
  }];
}
