import Database from "better-sqlite3";
import path from "path";
import { getOpenAiBaseUrl, getOpenAiKey, openAiSettings } from "@/lib/ai-settings";
import { cleanEmailDisplayBody } from "@/lib/email-crm-policy";
import { getDealManualOverrides } from "@/lib/deal-overrides";

const sqlite = new Database(process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db"), { timeout: 15000 });

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS deal_ai_intelligence (
    deal_id TEXT PRIMARY KEY,
    summary TEXT,
    source_thread_id TEXT,
    confidence REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
`);

type DealAiDecision = {
  summary?: string;
  dealTitle?: string | null;
  quotedAmountRub?: number | null;
  suggestedStage?: string | null;
  confidence?: number;
};

function words(value: unknown) {
  return new Set(String(value || "").toLowerCase().replace(/[^a-zа-яё0-9]+/gi, " ").split(/\s+/).filter((x) => x.length > 3));
}
function similarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let n = 0; for (const x of a) if (b.has(x)) n += 1;
  return n / Math.min(a.size, b.size);
}
function explicitThreadId(notes: unknown) {
  return String(notes || "").match(/\[email-thread:([^\]]+)\]/i)?.[1] || null;
}
function chooseThread(deal: any) {
  const explicit = explicitThreadId(deal.notes);
  if (explicit) {
    const thread = sqlite.prepare(`SELECT * FROM email_threads WHERE id=? AND contact_id=? AND COALESCE(is_service,0)=0`).get(explicit, deal.contact_id) as any;
    if (thread) return thread;
  }
  const threads = sqlite.prepare(`SELECT * FROM email_threads WHERE contact_id=? AND COALESCE(is_service,0)=0 ORDER BY last_message_at DESC`).all(deal.contact_id) as any[];
  if (!threads.length) return null;
  if (threads.length === 1) return threads[0];
  const dealWords = words(deal.title);
  return [...threads].sort((a, b) => similarity(dealWords, words(b.subject)) - similarity(dealWords, words(a.subject)) || Number(b.last_message_at) - Number(a.last_message_at))[0];
}
function threadConversation(threadId: string) {
  return (sqlite.prepare(`SELECT direction,subject,body_text AS bodyText,received_at AS receivedAt FROM email_messages WHERE thread_id=? ORDER BY received_at ASC LIMIT 240`).all(threadId) as any[])
    .map((m) => ({ direction: m.direction, subject: String(m.subject || ""), text: cleanEmailDisplayBody(m.bodyText), receivedAt: Number(m.receivedAt) }))
    .filter((m) => m.text || m.subject);
}
function amountHasEvidence(text: string, rub: number) {
  const target = Math.round(rub);
  const matches = text.matchAll(/(\d[\d\s]{1,12})(?:[,.]\d{1,2})?\s*(?:₽|руб(?:\.|лей|ля)?|rub)/gi);
  for (const match of matches) {
    const n = Number(match[1].replace(/\s/g, ""));
    if (Number.isFinite(n) && n === target) return true;
  }
  return false;
}

async function askAi(payload: unknown): Promise<DealAiDecision> {
  const key = getOpenAiKey();
  if (!key) throw new Error("AI API не подключён");
  const base = getOpenAiBaseUrl();
  const model = openAiSettings().model;
  const stages = sqlite.prepare(`SELECT name FROM pipeline_stages ORDER BY "order"`).all() as Array<{ name: string }>;
  const system = `Ты AI-менеджер Satori CRM. Анализируй ТОЛЬКО одну конкретную сделку и ТОЛЬКО переданную переписку этой сделки. Не используй сведения о других клиентах. Верни JSON: summary, dealTitle, quotedAmountRub, suggestedStage, confidence. summary — четыре короткие строки своими словами: "Хочет:", "Предложено:", "Сумма:", "Стадия:". Никаких цитат писем, HTML, email-заголовков, ID и технического текста. quotedAmountRub — только итоговая сумма, прямо названная в переписке; если её нет — null. suggestedStage — строго одно из этих названий: ${stages.map((s) => s.name).join(" | ")}. Стадию определяй по последнему фактическому состоянию переговоров.`;
  const official = base.includes("api.openai.com");
  const response = await fetch(official ? `${base}/responses` : `${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(official ? {
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify(payload) }] },
      ],
      text: { format: { type: "json_object" } },
    } : {
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(payload) }],
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok) throw new Error(`AI API: ${response.status} ${(await response.text()).slice(0, 250)}`);
  const json = await response.json() as any;
  const text = official ? json.output_text || json.output?.flatMap((x: any) => x.content || []).find((x: any) => x.type === "output_text")?.text : json.choices?.[0]?.message?.content;
  if (!text) throw new Error("AI не вернул результат");
  return JSON.parse(text) as DealAiDecision;
}

export function getDealAiSummary(dealId: string) {
  return sqlite.prepare(`SELECT summary,source_thread_id AS sourceThreadId,confidence,updated_at AS updatedAt FROM deal_ai_intelligence WHERE deal_id=?`).get(dealId) as any || null;
}

export function dealAiNeedsRefresh(dealId: string) {
  const deal = sqlite.prepare(`SELECT * FROM deals WHERE id=?`).get(dealId) as any;
  if (!deal) return false;
  const thread = chooseThread(deal);
  if (!thread) return false;
  const current = getDealAiSummary(dealId);
  return !current || Number(current.updatedAt || 0) < Number(thread.last_message_at || 0);
}

export async function analyzeDealWithAi(dealId: string, apply = true) {
  const deal = sqlite.prepare(`SELECT d.*,c.name AS contactName,c.email AS contactEmail,c.company AS contactCompany FROM deals d JOIN contacts c ON c.id=d.contact_id WHERE d.id=?`).get(dealId) as any;
  if (!deal) throw new Error("Сделка не найдена");
  const thread = chooseThread(deal);
  if (!thread) return { analyzed: false, reason: "У сделки нет отдельной клиентской переписки" };
  const conversation = threadConversation(thread.id);
  if (!conversation.length) return { analyzed: false, reason: "Переписка пуста" };
  const decision = await askAi({ deal: { id: deal.id, title: deal.title, contactName: deal.contactName, contactCompany: deal.contactCompany }, thread: { subject: thread.subject, remoteEmail: thread.remote_email }, conversation });
  const confidence = Math.max(0, Math.min(1, Number(decision.confidence || 0)));
  const summary = String(decision.summary || "").trim();
  sqlite.prepare(`INSERT INTO deal_ai_intelligence(deal_id,summary,source_thread_id,confidence,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(deal_id) DO UPDATE SET summary=excluded.summary,source_thread_id=excluded.source_thread_id,confidence=excluded.confidence,updated_at=excluded.updated_at`).run(dealId, summary || null, thread.id, confidence, Date.now());
  if (apply && confidence >= 0.82) {
    const locks = getDealManualOverrides(dealId);
    const allText = conversation.map((m) => `${m.subject}\n${m.text}`).join("\n");
    const title = String(decision.dealTitle || "").trim();
    if (!locks.titleLocked && title.length >= 3) sqlite.prepare(`UPDATE deals SET title=?,updated_at=? WHERE id=?`).run(title.slice(0, 120), Date.now(), dealId);
    const amount = Number(decision.quotedAmountRub || 0);
    if (!locks.valueLocked && amount > 0 && amount <= 10_000_000 && amountHasEvidence(allText, amount)) sqlite.prepare(`UPDATE deals SET value=?,updated_at=? WHERE id=?`).run(Math.round(amount * 100), Date.now(), dealId);
    const stage = String(decision.suggestedStage || "").trim();
    if (!locks.stageLocked && stage) {
      const target = sqlite.prepare(`SELECT id FROM pipeline_stages WHERE lower(name)=lower(?) LIMIT 1`).get(stage) as any;
      if (target?.id) sqlite.prepare(`UPDATE deals SET stage_id=?,updated_at=? WHERE id=?`).run(target.id, Date.now(), dealId);
    }
  }
  return { analyzed: true, decision, threadId: thread.id };
}
