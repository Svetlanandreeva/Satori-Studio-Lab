import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "../server/auth.js";
import { listOrders } from "../server/orders.js";
import { listLeads } from "../server/leads.js";
import {
  integrationStatus,
  normalizePhone,
  normalizeTelegram,
  parseTelegramWebhook,
  parseWhatsAppWebhook,
  sendOwnerTelegram,
  sendTelegramText,
  sendWhatsAppText,
  telegramOpenUrl,
  verifyTelegramWebhook,
  verifyWhatsAppWebhook,
  whatsappOpenUrl,
} from "./integrations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const HISTORY_FILE = path.join(DATA_DIR, "communications.json");
const POLL_MS = Math.max(5000, Number(process.env.CRM_CHANNEL_POLL_MS || 10000));

let writeQueue = Promise.resolve();
let watcherReady = false;
let seenOrders = new Set();
let seenLeads = new Set();

async function ensureHistory() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(HISTORY_FILE)) await writeFile(HISTORY_FILE, "[]\n", "utf-8");
}

async function readHistory() {
  await ensureHistory();
  const raw = await readFile(HISTORY_FILE, "utf-8");
  const data = raw.trim() ? JSON.parse(raw) : [];
  return Array.isArray(data) ? data : [];
}

function appendHistory(item) {
  const run = async () => {
    const items = await readHistory();
    const duplicate = item.externalId && items.some((x) => x.channel === item.channel && x.externalId === item.externalId);
    if (!duplicate) {
      items.unshift({ id: randomUUID(), ...item });
      if (items.length > 1000) items.length = 1000;
      await writeFile(HISTORY_FILE, JSON.stringify(items, null, 2), "utf-8");
    }
  };
  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}

function matchHistory(items, { phone, telegram }) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedTelegram = normalizeTelegram(telegram).toLowerCase();
  return items.filter((item) => {
    if (normalizedPhone && normalizePhone(item.phone || item.from || item.to) === normalizedPhone) return true;
    if (normalizedTelegram) {
      const candidates = [item.telegram, item.username, item.from, item.to].map((x) => normalizeTelegram(x).toLowerCase());
      if (candidates.includes(normalizedTelegram)) return true;
    }
    return false;
  });
}

async function resolveTelegramChatId(contact) {
  const normalized = normalizeTelegram(contact);
  if (/^-?\d+$/.test(normalized)) return normalized;
  if (!normalized) return "";
  const items = await readHistory();
  const found = items.find((item) => item.channel === "telegram" && item.direction === "inbound" && normalizeTelegram(item.username).toLowerCase() === normalized.toLowerCase() && /^-?\d+$/.test(String(item.from || "")));
  return found?.from || "";
}

function ownerOrderText(order) {
  const items = (order.items || []).map((x) => x.name).filter(Boolean).join(", ");
  return `🛍 Новый заказ Satori\n${order.customer?.name || "Клиент"}${order.customer?.phone ? ` · ${order.customer.phone}` : ""}\n${items || "Заказ"}${order.amount ? `\n${Number(order.amount).toLocaleString("ru-RU")} ₽` : ""}`;
}

function ownerLeadText(lead) {
  const kind = lead.type === "business" ? `B2B · ${lead.company || "Компания"}` : "Индивидуальный заказ";
  return `✨ Новая заявка Satori\n${lead.name || "Новый клиент"}${lead.phone ? ` · ${lead.phone}` : ""}\n${kind}${lead.idea || lead.comment ? `\n${lead.idea || lead.comment}` : ""}`;
}

async function pollForOwnerNotifications() {
  try {
    const [orders, leads] = await Promise.all([listOrders(), listLeads()]);
    if (!watcherReady) {
      seenOrders = new Set(orders.map((x) => x.id));
      seenLeads = new Set(leads.map((x) => x.id));
      watcherReady = true;
      return;
    }
    const newOrders = orders.filter((x) => !seenOrders.has(x.id));
    const newLeads = leads.filter((x) => !seenLeads.has(x.id));
    orders.forEach((x) => seenOrders.add(x.id));
    leads.forEach((x) => seenLeads.add(x.id));
    for (const order of newOrders) await sendOwnerTelegram(ownerOrderText(order));
    for (const lead of newLeads) await sendOwnerTelegram(ownerLeadText(lead));
  } catch (error) {
    console.error("CRM channel watcher failed:", error?.message || error);
  }
}

export function startIntegrationWatcher() {
  pollForOwnerNotifications();
  setInterval(pollForOwnerNotifications, POLL_MS).unref();
}

export function createIntegrationsRouter() {
  const router = express.Router();

  router.get("/status", requireAdmin, (req, res) => res.json(integrationStatus()));

  router.get("/history", requireAdmin, async (req, res) => {
    const items = await readHistory();
    res.json(matchHistory(items, { phone: req.query.phone, telegram: req.query.telegram }).slice(0, 50));
  });

  router.post("/message", requireAdmin, async (req, res) => {
    try {
      const channel = String(req.body?.channel || "");
      const text = String(req.body?.text || "").trim();
      const phone = String(req.body?.phone || "").trim();
      const telegram = String(req.body?.telegram || "").trim();
      const name = String(req.body?.name || "").trim();
      if (!text) return res.status(400).json({ error: "Введите сообщение" });

      let result;
      let recipient = "";
      if (channel === "whatsapp") {
        recipient = normalizePhone(phone);
        if (!recipient) return res.status(400).json({ error: "У клиента нет номера телефона" });
        result = await sendWhatsAppText({ to: recipient, text });
      } else if (channel === "telegram") {
        const chatId = await resolveTelegramChatId(telegram);
        recipient = chatId || normalizeTelegram(telegram);
        if (!recipient) return res.status(400).json({ error: "У клиента не указан Telegram" });
        result = await sendTelegramText({ chatId, username: telegram, text });
      } else {
        return res.status(400).json({ error: "Неизвестный канал" });
      }

      await appendHistory({
        channel,
        direction: "outbound",
        externalId: result.messageId || "",
        to: recipient,
        phone: channel === "whatsapp" ? recipient : "",
        telegram: channel === "telegram" ? normalizeTelegram(telegram) : "",
        name,
        text,
        delivery: result.mode,
        createdAt: new Date().toISOString(),
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error("CRM message failed:", error?.message || error);
      res.status(502).json({ error: error?.message || "Не удалось отправить сообщение" });
    }
  });

  router.post("/test-owner-telegram", requireAdmin, async (req, res) => {
    try {
      const status = integrationStatus();
      if (!status.telegram.ownerNotifications) return res.status(400).json({ error: "TELEGRAM_BOT_TOKEN или TELEGRAM_OWNER_CHAT_ID не настроены" });
      await sendOwnerTelegram("✅ Satori CRM: Telegram подключён. Уведомления о новых заказах и заявках будут приходить сюда.");
      res.json({ ok: true });
    } catch (error) {
      res.status(502).json({ error: error?.message || "Не удалось отправить тест" });
    }
  });

  router.get("/whatsapp/webhook", (req, res) => {
    const challenge = verifyWhatsAppWebhook(req.query);
    if (challenge === null) return res.sendStatus(403);
    res.status(200).send(challenge);
  });

  router.post("/whatsapp/webhook", async (req, res) => {
    try {
      const messages = parseWhatsAppWebhook(req.body);
      for (const message of messages) await appendHistory({ ...message, phone: normalizePhone(message.from) });
      res.sendStatus(200);
    } catch (error) {
      console.error("WhatsApp webhook failed:", error?.message || error);
      res.sendStatus(200);
    }
  });

  router.post("/telegram/webhook", async (req, res) => {
    if (!verifyTelegramWebhook(req.headers)) return res.sendStatus(403);
    try {
      const messages = parseTelegramWebhook(req.body);
      for (const message of messages) await appendHistory({ ...message, telegram: message.username || message.from });
      res.sendStatus(200);
    } catch (error) {
      console.error("Telegram webhook failed:", error?.message || error);
      res.sendStatus(200);
    }
  });

  router.get("/open-link", requireAdmin, (req, res) => {
    const channel = String(req.query.channel || "");
    const text = String(req.query.text || "");
    if (channel === "whatsapp") return res.json({ url: whatsappOpenUrl(req.query.phone, text) });
    if (channel === "telegram") return res.json({ url: telegramOpenUrl(req.query.telegram) });
    res.status(400).json({ error: "Неизвестный канал" });
  });

  return router;
}
