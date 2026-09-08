import { Router } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "../server/auth.js";
import { listParserRuns, patchParserContact } from "./parser-history.js";
import { readCommunicationHistory, appendCommunicationHistory, resolveTelegramChatId } from "./integrations-router.js";
import {
  normalizePhone,
  normalizeTelegram,
  sendOwnerTelegram,
  sendTelegramText,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  telegramOpenUrl,
  whatsappOpenUrl,
} from "./integrations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "ai-sales.json");
const POLL_MS = Math.max(10000, Number(process.env.AI_MANAGER_POLL_MS || 20000));
const MODEL = process.env.AI_MANAGER_MODEL || "gpt-5.6-luna";
const TIMEZONE = process.env.AI_MANAGER_TIMEZONE || "Europe/Moscow";
const START_HOUR = Math.max(0, Math.min(23, Number(process.env.AI_MANAGER_START_HOUR || 10)));
const END_HOUR = Math.max(1, Math.min(24, Number(process.env.AI_MANAGER_END_HOUR || 19)));
const DAILY_LIMIT = Math.max(1, Number(process.env.AI_MANAGER_DAILY_LIMIT || 20));
const MAX_TOUCHES = Math.max(1, Number(process.env.AI_MANAGER_MAX_TOUCHES || 3));
const OUTREACH_TEMPLATE = process.env.WHATSAPP_OUTREACH_TEMPLATE_NAME || "";
const FOLLOWUP_TEMPLATE = process.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME || "";
const WHATSAPP_LANGUAGE = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "ru";

let writeQueue = Promise.resolve();
let tickRunning = false;

const STOP_RE = /(не\s*пишите|не\s*интересно|не\s*нужно|отпис|стоп|stop|unsubscribe|remove me|do not contact)/i;

function whatsappApiReady() {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

async function ensureState() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(STATE_FILE)) {
    await writeFile(STATE_FILE, JSON.stringify({
      settings: { enabled: false, autoSend: false },
      contacts: [],
      usage: { day: "", sent: 0 },
      createdAt: new Date().toISOString(),
    }, null, 2), "utf-8");
  }
}

async function readState() {
  await ensureState();
  const raw = await readFile(STATE_FILE, "utf-8");
  const data = raw.trim() ? JSON.parse(raw) : {};
  return {
    settings: { enabled: Boolean(data.settings?.enabled), autoSend: Boolean(data.settings?.autoSend) },
    contacts: Array.isArray(data.contacts) ? data.contacts : [],
    usage: data.usage && typeof data.usage === "object" ? data.usage : { day: "", sent: 0 },
    createdAt: data.createdAt || new Date().toISOString(),
  };
}

function mutateState(mutator) {
  const run = async () => {
    const state = await readState();
    const result = await mutator(state);
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
    return result;
  };
  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}

const text = (value) => String(value || "").trim();
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function contactKey(runId, contactId) {
  return `${runId}:${contactId}`;
}

function identityKey(contact = {}) {
  const phone = normalizePhone(contact.phone);
  if (phone) return `phone:${phone}`;
  const telegram = normalizeTelegram(contact.telegram).toLowerCase();
  if (telegram) return `telegram:${telegram}`;
  const email = text(contact.email).toLowerCase();
  if (email) return `email:${email}`;
  return "";
}

function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((x) => x.type === type)?.value || "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

function withinBusinessHours() {
  const { hour } = localParts();
  return hour >= START_HOUR && hour < END_HOUR;
}

function resetUsage(state) {
  const { day } = localParts();
  if (state.usage.day !== day) state.usage = { day, sent: 0 };
}

function stats(state) {
  const result = { total: state.contacts.length, new: 0, draft: 0, contacted: 0, replied: 0, qualified: 0, proposal: 0, deal: 0, human: 0, stopped: 0 };
  for (const item of state.contacts) {
    if (item.status === "new") result.new += 1;
    if (item.status === "draft_ready") result.draft += 1;
    if (item.stage === "contacted") result.contacted += 1;
    if (item.stage === "replied") result.replied += 1;
    if (item.stage === "qualified") result.qualified += 1;
    if (item.stage === "proposal") result.proposal += 1;
    if (item.stage === "deal" || item.dealId) result.deal += 1;
    if (item.status === "human") result.human += 1;
    if (["stopped", "lost"].includes(item.status) || item.stage === "lost") result.stopped += 1;
  }
  return result;
}

function publicSettings(state) {
  return {
    ...state.settings,
    configured: Boolean(process.env.OPENAI_API_KEY),
    model: MODEL,
    timezone: TIMEZONE,
    businessHours: `${String(START_HOUR).padStart(2, "0")}:00–${String(END_HOUR).padStart(2, "0")}:00`,
    dailyLimit: DAILY_LIMIT,
    maxTouches: MAX_TOUCHES,
    whatsappColdAuto: Boolean(OUTREACH_TEMPLATE && whatsappApiReady()),
    whatsappFollowupAuto: Boolean(FOLLOWUP_TEMPLATE && whatsappApiReady()),
  };
}

function snapshot(run, contact) {
  const previousStatus = text(contact.status).toLowerCase();
  const isDeal = Boolean(contact.importedToCrm) || previousStatus === "deal";
  const isStopped = ["stopped", "lost", "rejected"].includes(previousStatus);
  return {
    id: contactKey(run.id, contact.id),
    runId: run.id,
    contactId: contact.id,
    aliases: [],
    competitor: text(run.competitor),
    source: text(run.source),
    sourceUrl: text(contact.sourceUrl || run.sourceUrl),
    name: text(contact.name),
    role: text(contact.role),
    company: text(contact.company),
    phone: text(contact.phone),
    email: text(contact.email),
    telegram: text(contact.telegram),
    website: text(contact.website),
    status: isDeal ? "deal" : isStopped ? "stopped" : "new",
    stage: isDeal ? "deal" : isStopped ? "lost" : "new",
    score: 0,
    summary: "",
    draft: "",
    attempts: 0,
    lastActionAt: null,
    lastInboundId: "",
    nextFollowUpAt: null,
    dealId: "",
    dealTitle: "",
    paused: false,
    stopReason: isStopped ? "Контакт ранее остановлен" : "",
    events: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function syncContacts() {
  const runs = await listParserRuns();
  await mutateState((state) => {
    const known = new Map(state.contacts.map((x) => [x.id, x]));
    const identities = new Map(state.contacts.map((x) => [identityKey(x), x]).filter(([key]) => key));
    for (const run of runs) {
      for (const contact of run.contacts || []) {
        const id = contactKey(run.id, contact.id);
        let existing = known.get(id);
        if (!existing) {
          const identity = identityKey(contact);
          const duplicate = identity ? identities.get(identity) : null;
          if (duplicate) {
            duplicate.aliases = Array.isArray(duplicate.aliases) ? duplicate.aliases : [];
            if (!duplicate.aliases.some((alias) => alias.runId === run.id && alias.contactId === contact.id)) {
              duplicate.aliases.push({ runId: run.id, contactId: contact.id, competitor: text(run.competitor), source: text(run.source) });
            }
            duplicate.updatedAt = new Date().toISOString();
            continue;
          }
          const item = snapshot(run, contact);
          state.contacts.push(item);
          known.set(id, item);
          if (identity) identities.set(identity, item);
          existing = item;
        }
        existing.name = text(contact.name) || existing.name;
        existing.role = text(contact.role) || existing.role;
        existing.company = text(contact.company) || existing.company;
        existing.phone = text(contact.phone) || existing.phone;
        existing.email = text(contact.email) || existing.email;
        existing.telegram = text(contact.telegram) || existing.telegram;
        existing.website = text(contact.website) || existing.website;
        existing.sourceUrl = text(contact.sourceUrl || run.sourceUrl) || existing.sourceUrl;
        existing.competitor = text(run.competitor) || existing.competitor;
        existing.source = text(run.source) || existing.source;
      }
    }
    return true;
  });
}

function matchingMessages(items, lead) {
  const phone = normalizePhone(lead.phone);
  const telegram = normalizeTelegram(lead.telegram).toLowerCase();
  const chatId = text(lead.telegramChatId);
  return items.filter((item) => {
    if (phone && normalizePhone(item.phone || item.from || item.to) === phone) return true;
    const candidates = [item.telegram, item.username, item.from, item.to].map((v) => normalizeTelegram(v).toLowerCase()).filter(Boolean);
    if (telegram && candidates.includes(telegram)) return true;
    if (chatId && candidates.includes(chatId.toLowerCase())) return true;
    return false;
  }).sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
}

function conversationText(messages) {
  return messages.slice(-12).map((item) => `${item.direction === "inbound" ? "Клиент" : "Satori"}: ${text(item.text)}`).join("\n");
}

function leadContext(lead) {
  return {
    name: lead.name || null,
    role: lead.role || null,
    company: lead.company || null,
    competitor: lead.competitor || null,
    source: lead.source || null,
    website: lead.website || null,
    sourceUrl: lead.sourceUrl || null,
    currentStage: lead.stage,
    score: lead.score,
    attempts: lead.attempts,
    previousSummary: lead.summary || null,
  };
}

const DECISION_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["reply", "follow_up", "wait", "qualify", "convert", "stop", "human"] },
    stage: { type: "string", enum: ["new", "prepared", "contacted", "replied", "qualified", "proposal", "deal", "won", "lost", "paused"] },
    score: { type: "integer", minimum: 0, maximum: 100 },
    message: { type: "string" },
    summary: { type: "string" },
    nextFollowUpHours: { type: "integer", minimum: 0, maximum: 336 },
    needsHuman: { type: "boolean" },
    reason: { type: "string" },
    dealTitle: { type: ["string", "null"] },
    dealNotes: { type: ["string", "null"] },
    estimatedAmount: { type: ["number", "null"], minimum: 0 },
  },
  required: ["action", "stage", "score", "message", "summary", "nextFollowUpHours", "needsHuman", "reason", "dealTitle", "dealNotes", "estimatedAmount"],
  additionalProperties: false,
};

async function askModel({ mode, lead, messages = [] }) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY не задан");
  const instructions = `Ты AI sales manager студии Satori. Satori создаёт авторский свет, предметы интерьера, арт-объекты и индивидуальные/B2B проекты. Твоя цель — аккуратно довести релевантного лида до реальной сделки, а не любой ценой получить ответ.

Правила:
- Никогда не говори, что контакт найден парсером или у конкурента.
- Не придумывай факты о человеке/компании и не утверждай, что изучил сайт, если в контексте нет данных.
- Первое сообщение короткое, живое, без канцелярита и без давления.
- Не обещай точную цену, срок, скидку или техническую возможность без подтверждения человека.
- Квалифицируй мягко: что нужно, количество, размеры/формат, срок, ориентир по бюджету, город/доставка, брендинг/упаковка — спрашивай только то, что уместно в текущем сообщении, не анкетой.
- Если клиент явно просит не писать или отказывает — action=stop, stage=lost, message пустая строка.
- Если нужен нестандартный расчёт, юридическое обещание, конфликт, возврат, скидка, точная инженерная гарантия — needsHuman=true и action=human.
- convert используй только когда есть явный коммерческий интерес и достаточно контекста для карточки сделки.
- Отвечай на языке последнего сообщения клиента; если диалога ещё нет — на русском, если контекст явно не указывает другое.
- Не пиши длиннее 600 символов без необходимости.`;

  const input = {
    mode,
    lead: leadContext(lead),
    conversation: conversationText(messages),
    task: mode === "initial"
      ? "Оцени релевантность контакта и подготовь персонализированное первое сообщение."
      : mode === "followup"
        ? "Подготовь ненавязчивый follow-up с новым смыслом, не повторяя предыдущее сообщение."
        : "Проанализируй новое сообщение клиента, обнови стадию и реши следующий лучший шаг.",
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      reasoning: { effort: "none" },
      instructions,
      input: JSON.stringify(input),
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "satori_sales_decision",
          strict: true,
          schema: DECISION_SCHEMA,
        },
      },
      max_output_tokens: 1200,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${response.status}`);
  const output = text(data.output_text);
  if (!output) throw new Error("AI вернул пустой ответ");
  return JSON.parse(output);
}

function addEvent(lead, type, data = {}) {
  lead.events = Array.isArray(lead.events) ? lead.events : [];
  lead.events.unshift({ id: randomUUID(), type, at: new Date().toISOString(), ...data });
  if (lead.events.length > 100) lead.events.length = 100;
  lead.updatedAt = new Date().toISOString();
}

function applyDecision(lead, decision) {
  lead.score = Math.max(0, Math.min(100, number(decision.score)));
  lead.summary = text(decision.summary);
  lead.stage = text(decision.stage) || lead.stage;
  lead.draft = text(decision.message);
  if (decision.needsHuman || decision.action === "human") lead.status = "human";
  if (decision.action === "stop" || decision.stage === "lost") {
    lead.status = "stopped";
    lead.stage = "lost";
    lead.stopReason = text(decision.reason) || "AI остановил коммуникацию";
    lead.draft = "";
  }
  if (number(decision.nextFollowUpHours) > 0) {
    lead.nextFollowUpAt = new Date(Date.now() + number(decision.nextFollowUpHours) * 3600_000).toISOString();
  }
  addEvent(lead, "ai_decision", { action: decision.action, stage: decision.stage, reason: text(decision.reason), score: lead.score });
}

async function recordOutbound({ lead, channel, text: messageText, result }) {
  const recipient = channel === "whatsapp"
    ? normalizePhone(lead.phone)
    : (text(lead.telegramChatId) || normalizeTelegram(lead.telegram));
  await appendCommunicationHistory({
    channel,
    direction: "outbound",
    externalId: result?.messageId || "",
    to: recipient,
    phone: channel === "whatsapp" ? recipient : "",
    telegram: channel === "telegram" ? normalizeTelegram(lead.telegram) : "",
    name: lead.name,
    text: messageText,
    delivery: result?.mode || "api",
    createdAt: new Date().toISOString(),
    aiManager: true,
  });
}

async function directChannel(lead) {
  const phone = normalizePhone(lead.phone);
  if (phone && whatsappApiReady()) return { channel: "whatsapp", recipient: phone };
  const chatId = text(lead.telegramChatId) || await resolveTelegramChatId(lead.telegram);
  if (chatId && /^-?\d+$/.test(chatId)) return { channel: "telegram", recipient: chatId };
  if (phone) return { channel: "whatsapp", recipient: phone };
  return null;
}

async function sendInitialAutomatically(lead, state) {
  if (!state.settings.autoSend || !withinBusinessHours()) return false;
  resetUsage(state);
  if (state.usage.sent >= DAILY_LIMIT) return false;

  const phone = normalizePhone(lead.phone);
  if (phone && OUTREACH_TEMPLATE && whatsappApiReady()) {
    const result = await sendWhatsAppTemplate({
      to: phone,
      templateName: OUTREACH_TEMPLATE,
      languageCode: WHATSAPP_LANGUAGE,
      parameters: [lead.name || "", lead.company || ""].filter(Boolean),
    });
    await recordOutbound({ lead, channel: "whatsapp", text: `[WhatsApp template: ${OUTREACH_TEMPLATE}]`, result });
    state.usage.sent += 1;
    lead.status = "contacted";
    lead.stage = "contacted";
    lead.attempts += 1;
    lead.lastActionAt = new Date().toISOString();
    addEvent(lead, "sent", { channel: "whatsapp", mode: "template" });
    return true;
  }

  const channel = await directChannel(lead);
  if (channel?.channel === "telegram" && lead.draft) {
    const result = await sendTelegramText({ chatId: channel.recipient, text: lead.draft });
    if (result.mode !== "api") return false;
    await recordOutbound({ lead, channel: "telegram", text: lead.draft, result });
    state.usage.sent += 1;
    lead.status = "contacted";
    lead.stage = "contacted";
    lead.attempts += 1;
    lead.lastActionAt = new Date().toISOString();
    addEvent(lead, "sent", { channel: "telegram", mode: result.mode });
    return true;
  }
  return false;
}

async function sendReplyAutomatically(lead, state) {
  if (!state.settings.autoSend || !withinBusinessHours() || !lead.draft) return false;
  resetUsage(state);
  if (state.usage.sent >= DAILY_LIMIT) return false;
  const channel = await directChannel(lead);
  if (!channel) return false;
  let result;
  if (channel.channel === "whatsapp") result = await sendWhatsAppText({ to: channel.recipient, text: lead.draft });
  else result = await sendTelegramText({ chatId: channel.recipient, text: lead.draft });
  if (result.mode !== "api") return false;
  await recordOutbound({ lead, channel: channel.channel, text: lead.draft, result });
  state.usage.sent += 1;
  lead.status = lead.stage === "qualified" ? "qualified" : lead.stage === "proposal" ? "proposal" : "contacted";
  lead.lastActionAt = new Date().toISOString();
  addEvent(lead, "sent", { channel: channel.channel, mode: result.mode });
  return true;
}

async function sendFollowupAutomatically(lead, state) {
  if (!state.settings.autoSend || !withinBusinessHours() || !lead.draft) return false;
  resetUsage(state);
  if (state.usage.sent >= DAILY_LIMIT) return false;
  const phone = normalizePhone(lead.phone);
  if (phone && FOLLOWUP_TEMPLATE && whatsappApiReady()) {
    const result = await sendWhatsAppTemplate({
      to: phone,
      templateName: FOLLOWUP_TEMPLATE,
      languageCode: WHATSAPP_LANGUAGE,
      parameters: [lead.name || "", lead.company || ""].filter(Boolean),
    });
    await recordOutbound({ lead, channel: "whatsapp", text: `[WhatsApp template: ${FOLLOWUP_TEMPLATE}]`, result });
    state.usage.sent += 1;
    lead.attempts += 1;
    lead.lastActionAt = new Date().toISOString();
    addEvent(lead, "followup_sent", { channel: "whatsapp" });
    return true;
  }
  const channel = await directChannel(lead);
  if (channel?.channel === "telegram") {
    const result = await sendTelegramText({ chatId: channel.recipient, text: lead.draft });
    if (result.mode !== "api") return false;
    await recordOutbound({ lead, channel: "telegram", text: lead.draft, result });
    state.usage.sent += 1;
    lead.attempts += 1;
    lead.lastActionAt = new Date().toISOString();
    addEvent(lead, "followup_sent", { channel: "telegram" });
    return true;
  }
  return false;
}

async function maybeCreateDeal(lead, decision, createDeal) {
  if (lead.dealId || decision.action !== "convert") return;
  if (typeof createDeal !== "function") return;
  const deal = await createDeal({
    title: text(decision.dealTitle) || `${lead.company || lead.name || "Новый лид"} — AI lead`,
    clientName: lead.name,
    company: lead.company,
    phone: lead.phone,
    email: lead.email,
    telegram: lead.telegram,
    amount: number(decision.estimatedAmount),
    notes: [text(decision.dealNotes), lead.summary, `Источник: ${lead.source || "парсер"}${lead.competitor ? ` · ${lead.competitor}` : ""}`].filter(Boolean).join("\n"),
    sourceAiId: lead.id,
  });
  if (!deal) return;
  lead.dealId = deal.id;
  lead.dealTitle = deal.title;
  lead.stage = "deal";
  lead.status = "deal";
  addEvent(lead, "deal_created", { dealId: deal.id });
  await patchParserContact(lead.runId, lead.contactId, { status: "deal", importedToCrm: true });
  await sendOwnerTelegram(`🤖 AI-менеджер Satori создал сделку\n${deal.title}${lead.name ? `\nКонтакт: ${lead.name}` : ""}${lead.company ? ` · ${lead.company}` : ""}`);
}

async function processInitial(lead, state) {
  if (lead.paused || lead.status !== "new") return;
  if (!lead.phone && !lead.telegram) {
    lead.status = "human";
    lead.stopReason = "Нет WhatsApp/Telegram для контакта";
    addEvent(lead, "blocked", { reason: lead.stopReason });
    return;
  }
  const decision = await askModel({ mode: "initial", lead });
  applyDecision(lead, decision);
  if (["stopped", "human"].includes(lead.status)) return;
  lead.status = "draft_ready";
  lead.stage = "prepared";
  const sent = await sendInitialAutomatically(lead, state);
  if (!sent && lead.status !== "contacted") {
    lead.status = "draft_ready";
    lead.nextFollowUpAt = null;
  }
  await patchParserContact(lead.runId, lead.contactId, { status: lead.status });
}

async function processInbound(lead, state, allMessages, createDeal) {
  const messages = matchingMessages(allMessages, lead);
  const inbound = [...messages].reverse().find((item) => item.direction === "inbound");
  if (!inbound || inbound.id === lead.lastInboundId) return false;
  if (inbound.channel === "telegram" && /^-?\d+$/.test(text(inbound.from))) lead.telegramChatId = text(inbound.from);
  lead.lastInboundId = inbound.id;
  lead.status = "replied";
  lead.stage = "replied";
  addEvent(lead, "inbound", { channel: inbound.channel, text: text(inbound.text).slice(0, 500) });

  if (STOP_RE.test(text(inbound.text))) {
    lead.status = "stopped";
    lead.stage = "lost";
    lead.stopReason = "Клиент попросил прекратить коммуникацию";
    lead.draft = "";
    await patchParserContact(lead.runId, lead.contactId, { status: "stopped" });
    return true;
  }

  const decision = await askModel({ mode: "inbound", lead, messages });
  applyDecision(lead, decision);
  await maybeCreateDeal(lead, decision, createDeal);
  if (lead.status === "stopped") {
    await patchParserContact(lead.runId, lead.contactId, { status: "stopped" });
    return true;
  }
  if (!lead.dealId && decision.action !== "wait" && !decision.needsHuman && lead.draft) {
    const sent = await sendReplyAutomatically(lead, state);
    if (!sent) lead.status = "draft_ready";
  }
  await patchParserContact(lead.runId, lead.contactId, { status: lead.status, importedToCrm: Boolean(lead.dealId) });
  return true;
}

async function processFollowup(lead, state, allMessages) {
  if (lead.paused || lead.dealId || ["stopped", "lost", "human"].includes(lead.status)) return;
  if (lead.attempts < 1) return;
  if (!lead.nextFollowUpAt || new Date(lead.nextFollowUpAt).getTime() > Date.now()) return;
  if (lead.attempts >= MAX_TOUCHES) {
    lead.status = "human";
    lead.stopReason = `Достигнут лимит касаний: ${MAX_TOUCHES}`;
    addEvent(lead, "handoff", { reason: lead.stopReason });
    return;
  }
  const messages = matchingMessages(allMessages, lead);
  const inboundAfterLastAction = messages.some((item) => item.direction === "inbound" && new Date(item.createdAt).getTime() > new Date(lead.lastActionAt || 0).getTime());
  if (inboundAfterLastAction) return;
  const decision = await askModel({ mode: "followup", lead, messages });
  applyDecision(lead, decision);
  if (["stopped", "human"].includes(lead.status)) return;
  lead.status = "draft_ready";
  const sent = await sendFollowupAutomatically(lead, state);
  if (!sent) lead.status = "draft_ready";
  await patchParserContact(lead.runId, lead.contactId, { status: lead.status });
}

async function tick(createDeal) {
  if (tickRunning) return;
  tickRunning = true;
  try {
    await syncContacts();
    const allMessages = await readCommunicationHistory();
    await mutateState(async (state) => {
      resetUsage(state);
      if (!state.settings.enabled || !process.env.OPENAI_API_KEY) return false;
      for (const lead of state.contacts) {
        try {
          await processInbound(lead, state, allMessages, createDeal);
          if (lead.status === "new") await processInitial(lead, state);
          else await processFollowup(lead, state, allMessages);
        } catch (error) {
          lead.status = "error";
          lead.stopReason = error?.message || "Ошибка AI-менеджера";
          addEvent(lead, "error", { reason: lead.stopReason });
        }
      }
      return true;
    });
  } finally {
    tickRunning = false;
  }
}

export function createAiSalesManager({ createDeal } = {}) {
  const router = Router();
  router.use(requireAdmin);

  router.get("/", async (req, res) => {
    await syncContacts();
    const state = await readState();
    const q = text(req.query.q).toLowerCase();
    const status = text(req.query.status);
    const contacts = state.contacts.filter((item) => {
      if (status && item.status !== status && item.stage !== status) return false;
      if (q && !`${item.name} ${item.company} ${item.role} ${item.competitor} ${item.summary}`.toLowerCase().includes(q)) return false;
      return true;
    });
    res.json({ settings: publicSettings(state), stats: stats(state), contacts: contacts.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt))) });
  });

  router.patch("/settings", async (req, res) => {
    const settings = await mutateState((state) => {
      if (req.body?.enabled !== undefined) state.settings.enabled = Boolean(req.body.enabled);
      if (req.body?.autoSend !== undefined) state.settings.autoSend = Boolean(req.body.autoSend);
      return publicSettings(state);
    });
    res.json(settings);
  });

  router.post("/run", async (req, res) => {
    tick(createDeal).catch((error) => console.error("AI manager manual tick failed:", error));
    res.json({ ok: true });
  });

  router.patch("/contacts/:id", async (req, res) => {
    const updated = await mutateState((state) => {
      const lead = state.contacts.find((item) => item.id === req.params.id);
      if (!lead) return null;
      if (req.body?.paused !== undefined) lead.paused = Boolean(req.body.paused);
      if (req.body?.status !== undefined) lead.status = text(req.body.status);
      if (req.body?.draft !== undefined) lead.draft = text(req.body.draft);
      if (req.body?.nextFollowUpAt !== undefined) lead.nextFollowUpAt = req.body.nextFollowUpAt || null;
      addEvent(lead, "manual_update");
      return lead;
    });
    if (!updated) return res.status(404).json({ error: "Контакт AI-менеджера не найден" });
    res.json(updated);
  });

  router.get("/contacts/:id/open", async (req, res) => {
    const state = await readState();
    const lead = state.contacts.find((item) => item.id === req.params.id);
    if (!lead) return res.status(404).json({ error: "Контакт не найден" });
    const channel = text(req.query.channel) || (lead.phone ? "whatsapp" : "telegram");
    if (channel === "whatsapp") return res.json({ channel, url: whatsappOpenUrl(lead.phone, lead.draft), draft: lead.draft });
    return res.json({ channel: "telegram", url: telegramOpenUrl(lead.telegram), draft: lead.draft });
  });

  router.post("/contacts/:id/manual-sent", async (req, res) => {
    const updated = await mutateState(async (state) => {
      const lead = state.contacts.find((item) => item.id === req.params.id);
      if (!lead) return null;
      lead.status = "contacted";
      lead.stage = lead.stage === "prepared" ? "contacted" : lead.stage;
      lead.attempts += 1;
      lead.lastActionAt = new Date().toISOString();
      if (!lead.nextFollowUpAt) lead.nextFollowUpAt = new Date(Date.now() + 48 * 3600_000).toISOString();
      addEvent(lead, "manual_sent", { channel: text(req.body?.channel) });
      await patchParserContact(lead.runId, lead.contactId, { status: "contacted" });
      return lead;
    });
    if (!updated) return res.status(404).json({ error: "Контакт не найден" });
    res.json(updated);
  });

  router.post("/contacts/:id/create-deal", async (req, res) => {
    let output = null;
    await mutateState(async (state) => {
      const lead = state.contacts.find((item) => item.id === req.params.id);
      if (!lead) return null;
      if (lead.dealId) { output = lead; return lead; }
      const decision = {
        action: "convert",
        dealTitle: text(req.body?.title) || `${lead.company || lead.name || "Лид"} — проект`,
        dealNotes: text(req.body?.notes) || lead.summary,
        estimatedAmount: number(req.body?.amount),
      };
      await maybeCreateDeal(lead, decision, createDeal);
      output = lead;
      return lead;
    });
    if (!output) return res.status(404).json({ error: "Контакт не найден" });
    res.json(output);
  });

  function start() {
    syncContacts().catch((error) => console.error("AI manager sync failed:", error));
    setInterval(() => tick(createDeal).catch((error) => console.error("AI manager tick failed:", error)), POLL_MS).unref();
  }

  return { router, start, tick: () => tick(createDeal) };
}
