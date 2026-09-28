import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const sqlite = new Database(DB_PATH, { timeout: 15000 });
try { sqlite.pragma("journal_mode = WAL"); } catch {}
try { sqlite.pragma("busy_timeout = 15000"); } catch {}
try { sqlite.pragma("foreign_keys = ON"); } catch {}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS contact_intelligence (
    contact_id TEXT PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
    summary TEXT,
    request_text TEXT,
    budget_text TEXT,
    deadline_text TEXT,
    next_step TEXT,
    source_channels TEXT,
    last_dialog_at INTEGER,
    extracted_at INTEGER NOT NULL,
    auto_updates INTEGER NOT NULL DEFAULT 0,
    evidence_count INTEGER NOT NULL DEFAULT 0
  );
`);

type ContactRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
};

type DialogLine = {
  channel: "email" | "telegram";
  direction: "incoming" | "outgoing";
  text: string;
  at: number;
  remoteEmail?: string | null;
  remoteName?: string | null;
};

export interface ContactIntelligence {
  contactId: string;
  summary: string | null;
  requestText: string | null;
  budgetText: string | null;
  deadlineText: string | null;
  nextStep: string | null;
  sourceChannels: string[];
  lastDialogAt: number | null;
  extractedAt: number;
  autoUpdates: number;
  evidenceCount: number;
}

function tableExists(name: string): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function epochMs(value: unknown): number {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw < 10_000_000_000 ? raw * 1000 : raw;
}

function placeholderName(value: string): boolean {
  const name = String(value || "").trim();
  return !name || /need number|telegram\s*\d+|покупатель сайта|email контакт|клиент|без имени|^[^@\s]+@[^@\s]+$/i.test(name);
}

function cleanText(value: unknown): string {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\r/g, "")
    .replace(/^>.*$/gm, "")
    .replace(/^On .+ wrote:$/gim, "")
    .replace(/^.*писал\(а\):\s*$/gim, "")
    .replace(/^-{2,}\s*(Original Message|Исходное сообщение).*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20_000);
}

function sentences(text: string): string[] {
  return cleanText(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter((x) => x.length >= 8 && x.length <= 700);
}

function normalizePhone(value: string): string | null {
  const raw = value.trim();
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits.startsWith("7") && digits.length === 11 ? `+${digits}` : raw.startsWith("+") ? `+${digits}` : digits;
}

function extractPhone(lines: DialogLine[]): string | null {
  const pattern = /(?:\+?\d[\d\s().-]{8,}\d)/g;
  for (const line of lines.filter((x) => x.direction === "incoming")) {
    for (const match of line.text.match(pattern) || []) {
      const phone = normalizePhone(match);
      if (phone) return phone;
    }
  }
  return null;
}

function extractCompany(lines: DialogLine[]): string | null {
  const companyPattern = /^(?:компания\s*[:—-]?\s*)?((?:ООО|ИП|АО|ПАО)\s+[«"']?[^\n,;]{2,80}[»"']?|[^\n]{2,70}\s+(?:studio|студия|design|дизайн|group|групп|company))$/i;
  for (const line of lines.filter((x) => x.direction === "incoming")) {
    const candidates = cleanText(line.text).split("\n").map((x) => x.trim()).filter(Boolean).slice(-10).reverse();
    for (const candidate of candidates) {
      if (candidate.length > 100) continue;
      const match = candidate.match(companyPattern);
      if (match?.[1]) return match[1].trim();
    }
  }
  return null;
}

function findSentence(lines: DialogLine[], pattern: RegExp, direction?: "incoming" | "outgoing"): string | null {
  for (const line of lines) {
    if (direction && line.direction !== direction) continue;
    for (const sentence of sentences(line.text)) {
      pattern.lastIndex = 0;
      if (pattern.test(sentence)) return sentence.slice(0, 600);
    }
  }
  return null;
}

function extractRequest(lines: DialogLine[]): string | null {
  return findSentence(
    lines,
    /\b(нужн(?:о|а|ы)|хотим|хочу|интересует|заказать|изготовить|сделать|разработать|ищем|требуется|проект|тираж|мерч|светильник|ламп|абажур|мебел|декор)\b/i,
    "incoming"
  );
}

function extractBudget(lines: DialogLine[]): string | null {
  return findSentence(
    lines,
    /(?:бюджет|стоимост|цена|рассчитываем|до\s*)?.{0,45}\b\d[\d\s]*(?:[.,]\d+)?\s*(?:₽|руб(?:лей|ля|\.)?|тыс(?:яч)?\.?\s*(?:₽|руб)?|млн\.?\s*(?:₽|руб)?)/i,
    "incoming"
  );
}

function extractDeadline(lines: DialogLine[]): string | null {
  return findSentence(
    lines,
    /\b(срок|дедлайн|успеть|готово|готовность|до\s+\d{1,2}(?:[./-]\d{1,2})?|к\s+\d{1,2}(?:[./-]\d{1,2})?|\d+\s*(?:дн|дней|дня|недел|месяц))\b/i,
    "incoming"
  );
}

function extractNextStep(lines: DialogLine[]): string | null {
  const pattern = /\b(пришл|отправ|подготов|соглас|созвон|перезвон|свяж|уточн|жд[её]м|вернусь|вернемся|оплат|подпис|провер|посмотр)\w*/i;
  return findSentence(lines, pattern, "outgoing") || findSentence(lines, pattern, "incoming");
}

function emailDialogs(contact: ContactRow): DialogLine[] {
  if (!tableExists("email_messages") || !tableExists("email_threads")) return [];
  const email = String(contact.email || "").trim().toLowerCase();
  const rows = sqlite.prepare(`
    SELECT em.direction, em.body_text AS bodyText, em.received_at AS receivedAt,
      et.remote_email AS remoteEmail, et.remote_name AS remoteName
    FROM email_messages em
    JOIN email_threads et ON et.id=em.thread_id
    WHERE et.contact_id=? OR (? <> '' AND lower(et.remote_email)=?)
    ORDER BY em.received_at DESC
    LIMIT 100
  `).all(contact.id, email, email) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    channel: "email" as const,
    direction: String(row.direction) === "outgoing" ? "outgoing" as const : "incoming" as const,
    text: cleanText(row.bodyText),
    at: epochMs(row.receivedAt),
    remoteEmail: row.remoteEmail ? String(row.remoteEmail).trim().toLowerCase() : null,
    remoteName: row.remoteName ? String(row.remoteName).trim() : null,
  })).filter((row) => row.text || row.remoteEmail || row.remoteName);
}

function telegramDialogs(contact: ContactRow): DialogLine[] {
  if (!tableExists("activities")) return [];
  const rows = sqlite.prepare(`
    SELECT type, description, created_at AS createdAt
    FROM activities
    WHERE contact_id=? AND lower(type) LIKE 'telegram%'
    ORDER BY created_at DESC
    LIMIT 100
  `).all(contact.id) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const type = String(row.type || "").toLowerCase();
    const raw = String(row.description || "");
    const body = raw.includes("\n") ? raw.slice(raw.indexOf("\n") + 1) : raw;
    return {
      channel: "telegram" as const,
      direction: /outgoing/.test(type) ? "outgoing" as const : "incoming" as const,
      text: cleanText(body),
      at: epochMs(row.createdAt),
    };
  }).filter((row) => row.text);
}

function chooseRemoteIdentity(lines: DialogLine[]) {
  const emailLine = lines.find((x) => x.channel === "email" && x.remoteEmail);
  const nameLine = lines.find((x) => x.channel === "email" && x.remoteName && !/^(support|info|hello|sales)$/i.test(String(x.remoteName)));
  return {
    email: emailLine?.remoteEmail || null,
    name: nameLine?.remoteName || null,
  };
}

function sourceFromChannels(current: string | null, channels: Set<string>): string | null {
  const value = String(current || "").trim().toLowerCase();
  if (value && !["other", "otro", "unknown", "email"].includes(value)) return current;
  if (channels.has("telegram")) return "telegram_account";
  if (channels.has("email")) return "email";
  return current;
}

function summaryText(input: { requestText: string | null; budgetText: string | null; deadlineText: string | null; nextStep: string | null }): string | null {
  const parts = [
    input.requestText ? `Запрос: ${input.requestText}` : null,
    input.budgetText ? `Бюджет: ${input.budgetText}` : null,
    input.deadlineText ? `Срок: ${input.deadlineText}` : null,
    input.nextStep ? `Следующий шаг: ${input.nextStep}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}

export function enrichContactFromDialogs(contactId: string): { updatedFields: string[]; intelligence: ContactIntelligence | null } {
  const contact = sqlite.prepare(`SELECT id,name,email,phone,company,source FROM contacts WHERE id=?`).get(contactId) as ContactRow | undefined;
  if (!contact) return { updatedFields: [], intelligence: null };

  const lines = [...emailDialogs(contact), ...telegramDialogs(contact)].sort((a, b) => b.at - a.at);
  if (!lines.length) return { updatedFields: [], intelligence: getContactIntelligence(contactId) };

  const identity = chooseRemoteIdentity(lines);
  const channels = new Set(lines.map((x) => x.channel));
  const requestText = extractRequest(lines);
  const budgetText = extractBudget(lines);
  const deadlineText = extractDeadline(lines);
  const nextStep = extractNextStep(lines);
  const summary = summaryText({ requestText, budgetText, deadlineText, nextStep });
  const foundPhone = extractPhone(lines);
  const foundCompany = extractCompany(lines);
  const lastDialogAt = Math.max(...lines.map((x) => x.at).filter(Boolean));
  const updatedFields: string[] = [];

  let name = contact.name;
  let email = contact.email;
  let phone = contact.phone;
  let company = contact.company;
  let source = contact.source;

  if (placeholderName(name) && identity.name && identity.name.length >= 2 && identity.name.length <= 100) {
    name = identity.name; updatedFields.push("name");
  }
  if (!email && identity.email) { email = identity.email; updatedFields.push("email"); }
  if (!phone && foundPhone) { phone = foundPhone; updatedFields.push("phone"); }
  if (!company && foundCompany) { company = foundCompany; updatedFields.push("company"); }
  const nextSource = sourceFromChannels(source, channels);
  if (nextSource && nextSource !== source) { source = nextSource; updatedFields.push("source"); }

  if (updatedFields.length) {
    sqlite.prepare(`UPDATE contacts SET name=?,email=?,phone=?,company=?,source=?,updated_at=? WHERE id=?`)
      .run(name, email, phone, company, source, Date.now(), contact.id);
  }

  const now = Date.now();
  sqlite.prepare(`
    INSERT INTO contact_intelligence (
      contact_id, summary, request_text, budget_text, deadline_text, next_step,
      source_channels, last_dialog_at, extracted_at, auto_updates, evidence_count
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(contact_id) DO UPDATE SET
      summary=excluded.summary,
      request_text=COALESCE(excluded.request_text, contact_intelligence.request_text),
      budget_text=COALESCE(excluded.budget_text, contact_intelligence.budget_text),
      deadline_text=COALESCE(excluded.deadline_text, contact_intelligence.deadline_text),
      next_step=COALESCE(excluded.next_step, contact_intelligence.next_step),
      source_channels=excluded.source_channels,
      last_dialog_at=excluded.last_dialog_at,
      extracted_at=excluded.extracted_at,
      auto_updates=contact_intelligence.auto_updates + excluded.auto_updates,
      evidence_count=excluded.evidence_count
  `).run(
    contact.id,
    summary,
    requestText,
    budgetText,
    deadlineText,
    nextStep,
    Array.from(channels).sort().join(","),
    lastDialogAt || null,
    now,
    updatedFields.length,
    lines.length
  );

  return { updatedFields, intelligence: getContactIntelligence(contact.id) };
}

export function enrichContactsFromDialogs(): { contactsScanned: number; profilesUpdated: number; fieldsFilled: number } {
  const contacts = sqlite.prepare("SELECT id FROM contacts ORDER BY updated_at DESC").all() as Array<{ id: string }>;
  let profilesUpdated = 0;
  let fieldsFilled = 0;
  for (const contact of contacts) {
    try {
      const result = enrichContactFromDialogs(contact.id);
      if (result.intelligence) profilesUpdated++;
      fieldsFilled += result.updatedFields.length;
    } catch {}
  }
  return { contactsScanned: contacts.length, profilesUpdated, fieldsFilled };
}

export function getContactIntelligence(contactId: string): ContactIntelligence | null {
  const row = sqlite.prepare(`
    SELECT contact_id AS contactId, summary, request_text AS requestText, budget_text AS budgetText,
      deadline_text AS deadlineText, next_step AS nextStep, source_channels AS sourceChannels,
      last_dialog_at AS lastDialogAt, extracted_at AS extractedAt,
      auto_updates AS autoUpdates, evidence_count AS evidenceCount
    FROM contact_intelligence WHERE contact_id=?
  `).get(contactId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    contactId: String(row.contactId),
    summary: row.summary ? String(row.summary) : null,
    requestText: row.requestText ? String(row.requestText) : null,
    budgetText: row.budgetText ? String(row.budgetText) : null,
    deadlineText: row.deadlineText ? String(row.deadlineText) : null,
    nextStep: row.nextStep ? String(row.nextStep) : null,
    sourceChannels: String(row.sourceChannels || "").split(",").filter(Boolean),
    lastDialogAt: row.lastDialogAt ? Number(row.lastDialogAt) : null,
    extractedAt: Number(row.extractedAt || 0),
    autoUpdates: Number(row.autoUpdates || 0),
    evidenceCount: Number(row.evidenceCount || 0),
  };
}
