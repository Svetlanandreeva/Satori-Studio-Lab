import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type { ContactIntelligence } from "@/lib/contact-intelligence";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const sqlite = new Database(DB_PATH, { timeout: 15000 });
try { sqlite.pragma("journal_mode = WAL"); } catch {}
try { sqlite.pragma("busy_timeout = 15000"); } catch {}

type Line = {
  channel: "email" | "telegram";
  direction: "incoming" | "outgoing";
  text: string;
  at: number;
};

type ExistingRow = {
  summary: string | null;
  request_text: string | null;
  budget_text: string | null;
  deadline_text: string | null;
  next_step: string | null;
  source_channels: string | null;
  last_dialog_at: number | null;
  extracted_at: number;
  auto_updates: number;
  evidence_count: number;
};

function tableExists(name: string): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function epochMs(value: unknown): number {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw < 10_000_000_000 ? raw * 1000 : raw;
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
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length >= 4 && item.length <= 900);
}

function collectLines(contactId: string, email: string): Line[] {
  const lines: Line[] = [];

  if (tableExists("email_messages") && tableExists("email_threads")) {
    const rows = sqlite.prepare(`
      SELECT em.direction, em.body_text AS bodyText, em.received_at AS receivedAt
      FROM email_messages em
      JOIN email_threads et ON et.id=em.thread_id
      WHERE et.contact_id=? OR (? <> '' AND lower(et.remote_email)=?)
      ORDER BY em.received_at DESC
      LIMIT 120
    `).all(contactId, email, email) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const text = cleanText(row.bodyText);
      if (!text) continue;
      lines.push({
        channel: "email",
        direction: String(row.direction) === "outgoing" ? "outgoing" : "incoming",
        text,
        at: epochMs(row.receivedAt),
      });
    }
  }

  if (tableExists("activities")) {
    const rows = sqlite.prepare(`
      SELECT type, description, created_at AS createdAt
      FROM activities
      WHERE contact_id=? AND lower(type) LIKE 'telegram%'
      ORDER BY created_at DESC
      LIMIT 120
    `).all(contactId) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const type = String(row.type || "").toLowerCase();
      const raw = String(row.description || "");
      const text = cleanText(raw.includes("\n") ? raw.slice(raw.indexOf("\n") + 1) : raw);
      if (!text) continue;
      lines.push({
        channel: "telegram",
        direction: /outgoing/.test(type) ? "outgoing" : "incoming",
        text,
        at: epochMs(row.createdAt),
      });
    }
  }

  return lines.sort((a, b) => b.at - a.at);
}

function findSentence(lines: Line[], pattern: RegExp, directions: Array<"incoming" | "outgoing">): string | null {
  for (const direction of directions) {
    for (const line of lines) {
      if (line.direction !== direction) continue;
      for (const sentence of sentences(line.text)) {
        pattern.lastIndex = 0;
        if (pattern.test(sentence)) return sentence.slice(0, 700);
      }
    }
  }
  return null;
}

function extractRequest(lines: Line[]): string | null {
  const productOrIntent = /(?:нужн|хот|интерес|заказ|изготов|сдел|разработ|ищем|требу|проект|тираж|мерч|светиль|ламп|абажур|мебел|декор|статуэт|витрин|упаков|стойк|панел|конструкц|вывеск|инсталляц|макет|образец|прототип|ткан|штор|кресл|стол|зеркал|люстр|бра)/iu;
  return findSentence(lines, productOrIntent, ["incoming"]);
}

function extractBudget(lines: Line[]): string | null {
  const price = /(?:бюджет|стоимост|цена|цену|сумм|расч[её]т)[^.!?\n]{0,90}\d[\d\s]*(?:[.,]\d+)?\s*(?:₽|руб(?:лей|ля|\.)?|тыс(?:яч)?\.?|млн\.?)?|\d[\d\s]*(?:[.,]\d+)?\s*(?:₽|руб(?:лей|ля|\.)?|тыс(?:яч)?\.?\s*(?:₽|руб)?|млн\.?\s*(?:₽|руб)?)/iu;
  return findSentence(lines, price, ["incoming", "outgoing"]);
}

function extractDeadline(lines: Line[]): string | null {
  const duration = /(?:(?:срок|дедлайн|успет|готов|изготов|производ|достав|отправ)[^.!?\n]{0,100})?\d{1,3}\s*(?:рабоч(?:их|ие)?\s*)?(?:дн(?:я|ей)?|день|недел(?:я|и|ь)?|месяц(?:а|ев)?|час(?:а|ов)?)|(?:до|к)\s+\d{1,2}(?:[./-]\d{1,2})(?:[./-]\d{2,4})?/iu;
  return findSentence(lines, duration, ["incoming", "outgoing"]);
}

function extractNextStep(lines: Line[]): string | null {
  const next = /(?:пришл|отправ|подготов|соглас|созвон|перезвон|свяж|уточн|жд[её]м|верн|оплат|подпис|провер|посмотр|рассчита|смет|кп)/iu;
  return findSentence(lines, next, ["outgoing", "incoming"]);
}

function buildSummary(input: { requestText: string | null; budgetText: string | null; deadlineText: string | null; nextStep: string | null }): string | null {
  const parts = [
    input.requestText ? `Запрос: ${input.requestText}` : null,
    input.budgetText ? `Бюджет / цена: ${input.budgetText}` : null,
    input.deadlineText ? `Срок: ${input.deadlineText}` : null,
    input.nextStep ? `Следующий шаг: ${input.nextStep}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}

function readIntelligence(contactId: string): ContactIntelligence | null {
  const row = sqlite.prepare(`SELECT contact_id AS contactId,summary,request_text AS requestText,budget_text AS budgetText,
      deadline_text AS deadlineText,next_step AS nextStep,source_channels AS sourceChannels,last_dialog_at AS lastDialogAt,
      extracted_at AS extractedAt,auto_updates AS autoUpdates,evidence_count AS evidenceCount
    FROM contact_intelligence WHERE contact_id=?`).get(contactId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    contactId: String(row.contactId),
    summary: row.summary ? String(row.summary) : null,
    requestText: row.requestText ? String(row.requestText) : null,
    budgetText: row.budgetText ? String(row.budgetText) : null,
    deadlineText: row.deadlineText ? String(row.deadlineText) : null,
    nextStep: row.nextStep ? String(row.nextStep) : null,
    sourceChannels: String(row.sourceChannels || "").split(",").map((x) => x.trim()).filter(Boolean),
    lastDialogAt: row.lastDialogAt ? Number(row.lastDialogAt) : null,
    extractedAt: Number(row.extractedAt || Date.now()),
    autoUpdates: Number(row.autoUpdates || 0),
    evidenceCount: Number(row.evidenceCount || 0),
  };
}

export function repairContactContextFromDialogs(contactId: string): ContactIntelligence | null {
  if (!tableExists("contact_intelligence")) return null;
  const contact = sqlite.prepare("SELECT id,email FROM contacts WHERE id=?").get(contactId) as { id: string; email: string | null } | undefined;
  if (!contact) return null;
  const email = String(contact.email || "").trim().toLowerCase();
  const lines = collectLines(contactId, email);
  if (!lines.length) return readIntelligence(contactId);

  const existing = sqlite.prepare(`SELECT summary,request_text,budget_text,deadline_text,next_step,source_channels,last_dialog_at,
      extracted_at,auto_updates,evidence_count FROM contact_intelligence WHERE contact_id=?`).get(contactId) as ExistingRow | undefined;

  const requestText = extractRequest(lines) || existing?.request_text || null;
  const budgetText = extractBudget(lines) || existing?.budget_text || null;
  const deadlineText = extractDeadline(lines) || existing?.deadline_text || null;
  const nextStep = extractNextStep(lines) || existing?.next_step || null;
  const summary = buildSummary({ requestText, budgetText, deadlineText, nextStep });
  const channels = Array.from(new Set([
    ...String(existing?.source_channels || "").split(",").map((x) => x.trim()).filter(Boolean),
    ...lines.map((line) => line.channel),
  ])).sort();
  const lastDialogAt = Math.max(0, ...lines.map((line) => line.at).filter(Boolean));
  const now = Date.now();

  sqlite.prepare(`
    INSERT INTO contact_intelligence(contact_id,summary,request_text,budget_text,deadline_text,next_step,source_channels,last_dialog_at,extracted_at,auto_updates,evidence_count)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(contact_id) DO UPDATE SET
      summary=excluded.summary,
      request_text=excluded.request_text,
      budget_text=excluded.budget_text,
      deadline_text=excluded.deadline_text,
      next_step=excluded.next_step,
      source_channels=excluded.source_channels,
      last_dialog_at=excluded.last_dialog_at,
      extracted_at=excluded.extracted_at,
      evidence_count=excluded.evidence_count
  `).run(
    contactId,
    summary,
    requestText,
    budgetText,
    deadlineText,
    nextStep,
    channels.join(","),
    lastDialogAt || existing?.last_dialog_at || null,
    now,
    existing?.auto_updates || 0,
    lines.length
  );

  return readIntelligence(contactId);
}
