import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import webpush from "web-push";
import { login, requireAdmin } from "../server/auth.js";
import { listOrders, updateOrder } from "../server/orders.js";
import { listLeads } from "../server/leads.js";
import { createIntegrationsRouter, startIntegrationWatcher } from "./integrations-router.js";
import { createParserHistoryRouter } from "./parser-history.js";
import { createAiSalesManager } from "./ai-sales-manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", ".env"), quiet: true });

const app = express();
const PORT = Number(process.env.CRM_PORT || 3010);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "crm.json");
const PUSH_FILE = path.join(DATA_DIR, "push-subscriptions.json");
const VAPID_FILE = path.join(DATA_DIR, "vapid.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const BRAND_DIR = path.join(__dirname, "..", "public");
const STAGES = ["Новый запрос", "Расчёт", "Согласовано", "В производстве", "Готово", "Доставка", "Завершено"];
const PUSH_POLL_MS = Math.max(5000, Number(process.env.CRM_PUSH_POLL_MS || 10000));

let writeQueue = Promise.resolve();
let pushWriteQueue = Promise.resolve();
let vapidKeys = null;
let seenOrderIds = new Set();
let seenLeadIds = new Set();
let watcherReady = false;

async function ensureData() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) {
    await writeFile(DATA_FILE, JSON.stringify({ clients: [], deals: [], tasks: [], webOrderStages: {}, leadStages: {} }, null, 2), "utf-8");
  }
  if (!existsSync(PUSH_FILE)) await writeFile(PUSH_FILE, "[]\n", "utf-8");
}

async function readCrm() {
  await ensureData();
  const raw = await readFile(DATA_FILE, "utf-8");
  const data = raw.trim() ? JSON.parse(raw) : {};
  return {
    clients: Array.isArray(data.clients) ? data.clients : [],
    deals: Array.isArray(data.deals) ? data.deals : [],
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    webOrderStages: data.webOrderStages && typeof data.webOrderStages === "object" ? data.webOrderStages : {},
    leadStages: data.leadStages && typeof data.leadStages === "object" ? data.leadStages : {},
  };
}

function mutate(mutator) {
  const run = async () => {
    const data = await readCrm();
    const result = await mutator(data);
    await writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
    return result;
  };
  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}

async function readSubscriptions() {
  await ensureData();
  const raw = await readFile(PUSH_FILE, "utf-8");
  const data = raw.trim() ? JSON.parse(raw) : [];
  return Array.isArray(data) ? data : [];
}

function mutateSubscriptions(mutator) {
  const run = async () => {
    const subscriptions = await readSubscriptions();
    const result = await mutator(subscriptions);
    await writeFile(PUSH_FILE, JSON.stringify(subscriptions, null, 2), "utf-8");
    return result;
  };
  pushWriteQueue = pushWriteQueue.then(run, run);
  return pushWriteQueue;
}

async function ensureVapid() {
  if (vapidKeys) return vapidKeys;
  await mkdir(DATA_DIR, { recursive: true });
  if (existsSync(VAPID_FILE)) {
    const raw = await readFile(VAPID_FILE, "utf-8");
    vapidKeys = JSON.parse(raw);
  } else {
    vapidKeys = webpush.generateVAPIDKeys();
    await writeFile(VAPID_FILE, JSON.stringify(vapidKeys, null, 2), "utf-8");
  }
  webpush.setVapidDetails(process.env.CRM_VAPID_SUBJECT || "https://satorilabural.ru", vapidKeys.publicKey, vapidKeys.privateKey);
  return vapidKeys;
}

async function sendPush(payload) {
  await ensureVapid();
  const subscriptions = await readSubscriptions();
  if (!subscriptions.length) return;
  const stale = new Set();
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 120 });
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) stale.add(subscription.endpoint);
      else console.error("CRM push failed:", error?.message || error);
    }
  }));
  if (stale.size) await mutateSubscriptions((items) => {
    const fresh = items.filter((item) => !stale.has(item.endpoint));
    items.splice(0, items.length, ...fresh);
    return true;
  });
}

function orderPush(order) {
  const itemNames = (order.items || []).map((item) => item.name).filter(Boolean).join(", ");
  return {
    title: "Новый заказ Satori",
    body: `${order.customer?.name || "Клиент"}${itemNames ? ` · ${itemNames}` : ""}${order.amount ? ` · ${Number(order.amount).toLocaleString("ru-RU")} ₽` : ""}`,
    tag: `order-${order.id}`,
    url: "/",
  };
}

function leadPush(lead) {
  const kind = lead.type === "business" ? `B2B${lead.company ? ` · ${lead.company}` : ""}` : "Индивидуальный заказ";
  return {
    title: "Новая заявка Satori",
    body: `${lead.name || "Новый клиент"} · ${kind}`,
    tag: `lead-${lead.id}`,
    url: "/",
  };
}

async function pollSiteActivity() {
  try {
    const [orders, leads] = await Promise.all([listOrders(), listLeads()]);
    if (!watcherReady) {
      seenOrderIds = new Set(orders.map((item) => item.id));
      seenLeadIds = new Set(leads.map((item) => item.id));
      watcherReady = true;
      return;
    }
    const newOrders = orders.filter((item) => !seenOrderIds.has(item.id));
    const newLeads = leads.filter((item) => !seenLeadIds.has(item.id));
    orders.forEach((item) => seenOrderIds.add(item.id));
    leads.forEach((item) => seenLeadIds.add(item.id));
    for (const order of newOrders) await sendPush(orderPush(order));
    for (const lead of newLeads) await sendPush(leadPush(lead));
  } catch (error) {
    console.error("CRM site activity watcher failed:", error?.message || error);
  }
}

const normalize = (value) => String(value || "").trim().toLowerCase();
const normalizePhoneLocal = (value) => String(value || "").replace(/\D/g, "").replace(/^8(?=\d{10}$)/, "7");

function inferredContacts(orders, leads, manualClients) {
  const map = new Map();
  const put = (contact) => {
    const key = normalize(contact.phone) || normalize(contact.email) || `${normalize(contact.name)}:${normalize(contact.company)}`;
    if (!key || key === ":") return;
    const prev = map.get(key) || {};
    map.set(key, { ...prev, ...contact, id: contact.source === "manual" ? contact.id : (prev.id || contact.id) });
  };

  orders.forEach((o) => {
    const c = o.customer || {};
    put({ id: `order:${o.id}`, name: c.name || "Клиент сайта", company: c.company || "", phone: c.phone || "", email: c.email || "", contact: c.contactHandle || c.contact || "", source: "order", lastActivity: o.createdAt });
  });
  leads.forEach((l) => put({ id: `lead:${l.id}`, name: l.name || "Заявка", company: l.company || "", phone: l.phone || "", email: l.email || "", contact: l.contact || "", source: "lead", lastActivity: l.createdAt }));
  manualClients.forEach((c) => put({ ...c, source: "manual" }));

  return [...map.values()].sort((a, b) => String(b.lastActivity || b.createdAt || "").localeCompare(String(a.lastActivity || a.createdAt || "")));
}

function mapOrderStage(order) {
  const status = order.fulfillmentStatus || "Новый";
  if (status === "Выполнен" || status === "Отменён") return "Завершено";
  if (status === "Отправлен") return "Доставка";
  if (status === "Собран") return "Готово";
  if (status === "В работе") return "В производстве";
  return "Новый запрос";
}

function mapCrmStageToOrder(stage) {
  if (stage === "Завершено") return "Выполнен";
  if (stage === "Доставка") return "Отправлен";
  if (stage === "Готово") return "Собран";
  if (["Расчёт", "Согласовано", "В производстве"].includes(stage)) return "В работе";
  return "Новый";
}

async function createAiDeal(input = {}) {
  const now = new Date().toISOString();
  return mutate((data) => {
    const already = data.deals.find((deal) => deal.sourceAiId && deal.sourceAiId === input.sourceAiId);
    if (already) return already;

    const phone = normalizePhoneLocal(input.phone);
    const email = normalize(input.email);
    let client = data.clients.find((item) => (phone && normalizePhoneLocal(item.phone) === phone) || (email && normalize(item.email) === email));
    if (!client) {
      client = {
        id: randomUUID(),
        name: String(input.clientName || input.company || "AI lead").trim(),
        company: String(input.company || "").trim(),
        phone: String(input.phone || "").trim(),
        email: String(input.email || "").trim(),
        contact: String(input.telegram || "").trim(),
        notes: "Создано AI-менеджером из контакта парсера",
        source: "ai-parser",
        createdAt: now,
        lastActivity: now,
      };
      data.clients.unshift(client);
    }

    const deal = {
      id: randomUUID(),
      source: "ai-parser",
      sourceAiId: String(input.sourceAiId || ""),
      title: String(input.title || `${input.company || input.clientName || "AI lead"} — проект`).trim(),
      clientId: client.id,
      clientName: client.name,
      amount: Number(input.amount || 0),
      paid: 0,
      stage: "Расчёт",
      deadline: "",
      notes: String(input.notes || "").trim(),
      createdAt: now,
      updatedAt: now,
    };
    data.deals.unshift(deal);
    return deal;
  });
}

const aiManager = createAiSalesManager({ createDeal: createAiDeal });

app.use(express.json({ limit: "1mb" }));
app.use("/api/integrations", createIntegrationsRouter());
app.use("/api/parser-history", createParserHistoryRouter());
app.use("/api/ai-manager", aiManager.router);
app.use("/brand", express.static(BRAND_DIR, { maxAge: "7d" }));
app.use(express.static(PUBLIC_DIR, { maxAge: "1h" }));

app.post("/api/login", (req, res) => {
  try {
    const token = login(req.body?.password);
    if (!token) return res.status(401).json({ error: "Неверный пароль" });
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: error.message || "Ошибка входа" });
  }
});

app.get("/api/push/public-key", requireAdmin, async (req, res) => {
  try {
    const keys = await ensureVapid();
    res.json({ publicKey: keys.publicKey });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Не удалось подготовить push" });
  }
});

app.post("/api/push/subscribe", requireAdmin, async (req, res) => {
  const subscription = req.body?.subscription;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return res.status(400).json({ error: "Некорректная push-подписка" });
  await mutateSubscriptions((items) => {
    const idx = items.findIndex((item) => item.endpoint === subscription.endpoint);
    if (idx >= 0) items[idx] = subscription;
    else items.push(subscription);
    return true;
  });
  res.json({ ok: true });
});

app.delete("/api/push/subscribe", requireAdmin, async (req, res) => {
  const endpoint = String(req.body?.endpoint || "");
  await mutateSubscriptions((items) => {
    const fresh = items.filter((item) => item.endpoint !== endpoint);
    items.splice(0, items.length, ...fresh);
    return true;
  });
  res.json({ ok: true });
});

app.post("/api/push/test", requireAdmin, async (req, res) => {
  await sendPush({ title: "Satori CRM", body: "Уведомления подключены. Новые заявки и заказы будут приходить сюда.", tag: "satori-crm-test", url: "/" });
  res.json({ ok: true });
});

app.get("/api/bootstrap", requireAdmin, async (req, res) => {
  try {
    const [crm, orders, leads] = await Promise.all([readCrm(), listOrders(), listLeads()]);
    const webDeals = orders.map((o) => ({
      id: `web:${o.id}`,
      source: "web",
      sourceId: o.id,
      title: (o.items || []).map((item) => item.name).join(", ") || `Заказ ${o.id.slice(0, 8)}`,
      clientName: o.customer?.name || "Клиент сайта",
      phone: o.customer?.phone || "",
      amount: Number(o.amount || 0),
      paid: o.status === "paid" ? Number(o.amount || 0) : 0,
      paymentStatus: o.status,
      stage: crm.webOrderStages[o.id] || mapOrderStage(o),
      deadline: "",
      notes: o.customer?.comment || "",
      createdAt: o.createdAt,
      trackingCode: o.trackingCode || "",
    }));
    const leadDeals = leads.map((l) => ({
      id: `lead:${l.id}`,
      source: "lead",
      sourceId: l.id,
      title: l.type === "business" ? `B2B: ${l.company || "новая заявка"}` : "Индивидуальный заказ",
      clientName: l.name || l.company || "Новая заявка",
      phone: l.phone || l.contact || "",
      amount: 0,
      paid: 0,
      stage: crm.leadStages[l.id] || "Новый запрос",
      deadline: "",
      notes: l.idea || l.comment || [l.budget, l.inquiryType, l.volume].filter(Boolean).join(" · "),
      createdAt: l.createdAt,
    }));
    res.json({ stages: STAGES, contacts: inferredContacts(orders, leads, crm.clients), deals: [...crm.deals, ...leadDeals, ...webDeals], tasks: crm.tasks, stats: { webOrders: orders.length, leads: leads.length } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Не удалось загрузить CRM" });
  }
});

app.post("/api/clients", requireAdmin, async (req, res) => {
  const now = new Date().toISOString();
  const client = { id: randomUUID(), name: String(req.body?.name || "").trim(), company: String(req.body?.company || "").trim(), phone: String(req.body?.phone || "").trim(), email: String(req.body?.email || "").trim(), contact: String(req.body?.contact || "").trim(), notes: String(req.body?.notes || "").trim(), createdAt: now, lastActivity: now };
  if (!client.name) return res.status(400).json({ error: "Укажите имя клиента" });
  await mutate((data) => { data.clients.unshift(client); return client; });
  res.json(client);
});

app.patch("/api/clients/:id", requireAdmin, async (req, res) => {
  const client = await mutate((data) => {
    const idx = data.clients.findIndex((item) => item.id === req.params.id);
    if (idx < 0) return null;
    data.clients[idx] = { ...data.clients[idx], ...req.body, id: data.clients[idx].id, lastActivity: new Date().toISOString() };
    return data.clients[idx];
  });
  if (!client) return res.status(404).json({ error: "Клиент не найден" });
  res.json(client);
});

app.post("/api/deals", requireAdmin, async (req, res) => {
  const deal = { id: randomUUID(), source: "manual", title: String(req.body?.title || "Новый заказ").trim(), clientId: String(req.body?.clientId || ""), clientName: String(req.body?.clientName || "").trim(), amount: Number(req.body?.amount || 0), paid: Number(req.body?.paid || 0), stage: STAGES.includes(req.body?.stage) ? req.body.stage : STAGES[0], deadline: String(req.body?.deadline || ""), notes: String(req.body?.notes || "").trim(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const saved = await mutate((data) => { data.deals.unshift(deal); return deal; });
  res.json(saved);
});

app.patch("/api/deals/:id", requireAdmin, async (req, res) => {
  const dealId = String(req.params.id);
  if (dealId.startsWith("lead:")) {
    const leadId = dealId.slice(5);
    if (!STAGES.includes(req.body?.stage)) return res.status(400).json({ error: "Некорректный этап" });
    await mutate((data) => { data.leadStages[leadId] = req.body.stage; return true; });
    return res.json({ ok: true });
  }

  if (dealId.startsWith("web:")) {
    const orderId = dealId.slice(4);
    if (req.body?.stage !== undefined && !STAGES.includes(req.body.stage)) return res.status(400).json({ error: "Некорректный этап" });
    const patch = {};
    if (req.body?.stage !== undefined) {
      await mutate((data) => { data.webOrderStages[orderId] = req.body.stage; return true; });
      patch.fulfillmentStatus = mapCrmStageToOrder(req.body.stage);
    }
    if (req.body?.trackingCode !== undefined) patch.trackingCode = String(req.body.trackingCode || "");
    const updated = await updateOrder(orderId, patch);
    if (!updated) return res.status(404).json({ error: "Заказ не найден" });
    return res.json({ ok: true });
  }

  const deal = await mutate((data) => {
    const idx = data.deals.findIndex((item) => item.id === dealId);
    if (idx < 0) return null;
    const patch = { ...req.body };
    if (patch.amount !== undefined) patch.amount = Number(patch.amount || 0);
    if (patch.paid !== undefined) patch.paid = Number(patch.paid || 0);
    if (patch.stage !== undefined && !STAGES.includes(patch.stage)) delete patch.stage;
    data.deals[idx] = { ...data.deals[idx], ...patch, id: data.deals[idx].id, source: data.deals[idx].source || "manual", updatedAt: new Date().toISOString() };
    return data.deals[idx];
  });
  if (!deal) return res.status(404).json({ error: "Сделка не найдена" });
  res.json(deal);
});

app.delete("/api/deals/:id", requireAdmin, async (req, res) => {
  if (String(req.params.id).startsWith("web:") || String(req.params.id).startsWith("lead:")) return res.status(400).json({ error: "Системные заявки и заказы не удаляются из CRM" });
  const removed = await mutate((data) => { const before = data.deals.length; data.deals = data.deals.filter((item) => item.id !== req.params.id); return data.deals.length !== before; });
  if (!removed) return res.status(404).json({ error: "Сделка не найдена" });
  res.json({ ok: true });
});

app.post("/api/tasks", requireAdmin, async (req, res) => {
  const task = { id: randomUUID(), title: String(req.body?.title || "").trim(), due: String(req.body?.due || ""), dealId: String(req.body?.dealId || ""), done: false, createdAt: new Date().toISOString() };
  if (!task.title) return res.status(400).json({ error: "Напишите задачу" });
  const saved = await mutate((data) => { data.tasks.unshift(task); return task; });
  res.json(saved);
});

app.patch("/api/tasks/:id", requireAdmin, async (req, res) => {
  const task = await mutate((data) => {
    const idx = data.tasks.findIndex((item) => item.id === req.params.id);
    if (idx < 0) return null;
    data.tasks[idx] = { ...data.tasks[idx], ...req.body, id: data.tasks[idx].id };
    return data.tasks[idx];
  });
  if (!task) return res.status(404).json({ error: "Задача не найдена" });
  res.json(task);
});

app.delete("/api/tasks/:id", requireAdmin, async (req, res) => {
  const removed = await mutate((data) => { const before = data.tasks.length; data.tasks = data.tasks.filter((item) => item.id !== req.params.id); return data.tasks.length !== before; });
  if (!removed) return res.status(404).json({ error: "Задача не найдена" });
  res.json({ ok: true });
});

app.get("/health", (req, res) => res.json({ ok: true, service: "satori-crm" }));
app.get("/{*splat}", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

app.listen(PORT, async () => {
  await ensureVapid();
  await pollSiteActivity();
  setInterval(pollSiteActivity, PUSH_POLL_MS).unref();
  startIntegrationWatcher();
  aiManager.start();
  console.log(`Satori CRM listening on http://localhost:${PORT}`);
});
