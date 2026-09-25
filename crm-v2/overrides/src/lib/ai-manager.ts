import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getClientDocument, listClientDocuments } from "@/lib/client-documents";
import { getOpenAiKey, getOpenAiBaseUrl, openAiSettings } from "@/lib/ai-settings";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const sqlite = new Database(DB_PATH, { timeout: 15000 });
try { sqlite.pragma("journal_mode = WAL"); } catch {}
try { sqlite.pragma("busy_timeout = 15000"); } catch {}

type AiDecision = {
  summary?: string;
  disposition?: "active" | "unprocessed" | "lost" | "won" | "production" | "unknown";
  reason?: string | null;
  nextStep?: string | null;
  hasApplication?: boolean;
  lossReason?: string | null;
  suggestedStage?: string | null;
  followUpHours?: number | null;
  confidence?: number;
  documentFacts?: Record<string, unknown>;
  dealTitle?: string | null;
  quotedAmountRub?: number | null;
  paymentStatus?: "not_discussed" | "awaiting_payment" | "paid" | "partial" | null;
};

function tableExists(name: string) {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function cleanText(value: unknown): string {
  return String(value || "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 120000);
}

function lostStageId(): string | null {
  const row = sqlite.prepare(`
    SELECT id FROM pipeline_stages
    WHERE COALESCE(is_lost,0)=1 OR lower(name) LIKE '%отказ%'
    ORDER BY COALESCE(is_lost,0) DESC, "order" DESC LIMIT 1
  `).get() as { id?: string } | undefined;
  return row?.id || null;
}

function conversation(contactId: string) {
  // Email source of truth is email_messages joined through the exact contact-owned thread.
  // Do not mix legacy email activities: old duplicate repair could have assigned them to another client.
  const telegram = tableExists("activities")
    ? (sqlite.prepare(`
        SELECT type,description,created_at AS createdAt
        FROM activities
        WHERE contact_id=? AND lower(type) LIKE '%telegram%'
        ORDER BY created_at DESC LIMIT 160
      `).all(contactId) as any[]).reverse().map((item) => ({ ...item, description: cleanText(item.description) }))
    : [];

  const emails = tableExists("email_threads") && tableExists("email_messages")
    ? (sqlite.prepare(`
        SELECT 'email' AS type,em.direction,em.subject,em.body_text AS description,em.received_at AS createdAt
        FROM email_messages em
        JOIN email_threads et ON et.id=em.thread_id
        WHERE et.contact_id=?
        ORDER BY em.received_at DESC LIMIT 200
      `).all(contactId) as any[]).reverse().map((item) => ({
        ...item,
        description: cleanText(item.description),
      }))
    : [];

  return [...telegram, ...emails]
    .sort((a: any, b: any) => Number(a.createdAt) - Number(b.createdAt))
    .slice(-260);
}

async function callOpenAI(input: unknown): Promise<AiDecision | null> {
  const key = getOpenAiKey();
  if (!key) return null;
  const model = openAiSettings().model;
  const baseUrl = getOpenAiBaseUrl();
  const system = `Ты AI-менеджер SATORI CRM. Анализируй ТОЛЬКО предоставленную переписку конкретного клиента и документы этого клиента. Никогда не переноси факты между разными клиентами. Верни ТОЛЬКО JSON: summary, disposition(active|unprocessed|lost|won|production|unknown), reason, nextStep, hasApplication, lossReason, suggestedStage, followUpHours, confidence(0..1), documentFacts, dealTitle, quotedAmountRub, paymentStatus(not_discussed|awaiting_payment|paid|partial). Не выдумывай. hasApplication=true только если клиент реально сформулировал коммерческий запрос. lost — только при явном отказе. summary пиши своими словами, без цитат, HTML, email-заголовков и технических id. Формат summary ровно 4 короткие строки: "Хочет: ...", "Предложено: ...", "Сумма: ...", "Стадия: ...". dealTitle — короткое человеческое название предмета заказа. quotedAmountRub — только явно названная итоговая сумма из conversation/selectedDocument; если суммы нет — null. suggestedStage обязан быть ТОЧНО одним из availableStages и отражать последнюю фактическую стадию переговоров. Если КП отправлено, это не "Новый запрос". Если счет/условия согласованы и ждём оплату, выбери соответствующую стадию ожидания оплаты.`;
  const official = baseUrl.includes("api.openai.com");
  const response = await fetch(official ? `${baseUrl}/responses` : `${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(official ? {
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify(input) }] },
      ],
      text: { format: { type: "json_object" } },
    } : {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(input) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok) throw new Error(`AI API: ${response.status} ${(await response.text()).slice(0, 300)}`);
  const json = await response.json() as Record<string, any>;
  const text = official
    ? json.output_text || json.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text
    : json.choices?.[0]?.message?.content;
  return text ? JSON.parse(text) as AiDecision : null;
}

async function documentInput(documentId: string, contactId: string) {
  const doc = getClientDocument(documentId, contactId);
  if (!doc) return null;
  const ext = path.extname(doc.filePath).toLowerCase();
  if (ext === ".txt" || ext === ".csv") {
    return { name: doc.name, kind: doc.kind, text: fs.readFileSync(doc.filePath, "utf8").slice(0, 120000) };
  }
  if ([".pdf", ".png", ".jpg", ".jpeg", ".webp"].includes(ext) && fs.statSync(doc.filePath).size <= 18 * 1024 * 1024) {
    const bytes = fs.readFileSync(doc.filePath).toString("base64");
    return { name: doc.name, kind: doc.kind, dataUrl: `data:${doc.mimeType || "application/octet-stream"};base64,${bytes}` };
  }
  return { name: doc.name, kind: doc.kind, note: "Файл сохранён в CRM; этот формат сейчас не читается автоматически." };
}

export async function analyzeContactWithAi(contactId: string, options: { documentId?: string; apply?: boolean } = {}) {
  const contact = sqlite.prepare("SELECT id,name,email,phone,company,source,qualification FROM contacts WHERE id=?").get(contactId) as Record<string, unknown> | undefined;
  if (!contact) throw new Error("Клиент не найден");

  const deals = sqlite.prepare(`
    SELECT d.id,d.title,d.created_at AS createdAt,d.updated_at AS updatedAt,
      ps.name AS stageName,ps.is_lost AS isLost,ps.is_won AS isWon
    FROM deals d
    JOIN pipeline_stages ps ON ps.id=d.stage_id
    WHERE d.contact_id=?
    ORDER BY d.updated_at DESC
  `).all(contactId) as any[];
  const docs = listClientDocuments(contactId).map((doc) => ({ id: doc.id, name: doc.name, kind: doc.kind, createdAt: doc.createdAt }));
  const selected = options.documentId ? await documentInput(options.documentId, contactId) : null;
  const stages = sqlite.prepare("SELECT name,is_won AS isWon,is_lost AS isLost FROM pipeline_stages ORDER BY \"order\"").all();
  const payload: any = {
    contact,
    deals,
    availableStages: stages,
    conversation: conversation(contactId),
    documents: docs,
    selectedDocument: selected && !("dataUrl" in selected) ? selected : selected ? { name: selected.name, kind: selected.kind } : null,
  };

  const key = getOpenAiKey();
  if (!key) return { configured: false, applied: false, message: "Добавьте OPENAI_API_KEY на сервер", context: payload };

  let decision: AiDecision | null;
  if (selected && "dataUrl" in selected && getOpenAiBaseUrl().includes("api.openai.com")) {
    const model = openAiSettings().model;
    const system = "Ты AI-менеджер SATORI CRM. Прочитай только данные этого клиента и приложенный документ. Верни JSON с summary, disposition, reason, nextStep, confidence, documentFacts, dealTitle, quotedAmountRub, paymentStatus. Не цитируй сырой HTML и не смешивай клиентов.";
    const response = await fetch(`${getOpenAiBaseUrl()}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify(payload) }, { type: "input_file", filename: selected.name, file_data: selected.dataUrl }] },
        ],
        text: { format: { type: "json_object" } },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI: ${response.status} ${(await response.text()).slice(0, 300)}`);
    const json = await response.json() as any;
    const text = json.output_text || json.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text;
    decision = text ? JSON.parse(text) : null;
  } else {
    decision = await callOpenAI(payload);
  }

  if (!decision) throw new Error("AI не вернул результат");
  const confidence = Number(decision.confidence || 0);
  let applied = false;

  if (options.apply && confidence >= 0.82) {
    sqlite.transaction(() => {
      if (decision.summary) {
        sqlite.prepare(`
          INSERT INTO contact_intelligence(contact_id,summary,extracted_at,auto_updates,evidence_count)
          VALUES(?,?,?,1,1)
          ON CONFLICT(contact_id) DO UPDATE SET
            summary=excluded.summary,
            extracted_at=excluded.extracted_at,
            auto_updates=contact_intelligence.auto_updates+1
        `).run(contactId, decision.summary, Date.now());
      }

      if (decision.hasApplication === true) {
        const currentDeal = sqlite.prepare("SELECT id FROM deals WHERE contact_id=? ORDER BY updated_at DESC LIMIT 1").get(contactId) as { id?: string } | undefined;
        if (currentDeal?.id) {
          const amountRub = Number(decision.quotedAmountRub || 0);
          const title = String(decision.dealTitle || "").trim();
          if (amountRub > 0 && amountRub <= 10_000_000) {
            sqlite.prepare("UPDATE deals SET value=?,updated_at=? WHERE id=?").run(Math.round(amountRub * 100), Date.now(), currentDeal.id);
          }
          if (title.length >= 3) sqlite.prepare("UPDATE deals SET title=?,updated_at=? WHERE id=?").run(title.slice(0, 120), Date.now(), currentDeal.id);
          if (decision.summary) sqlite.prepare("UPDATE deals SET notes=?,updated_at=? WHERE id=?").run(decision.summary, Date.now(), currentDeal.id);
        }

        sqlite.prepare("UPDATE contacts SET qualification='qualified',updated_at=? WHERE id=?").run(Date.now(), contactId);
        const activeDeal = sqlite.prepare(`
          SELECT d.id FROM deals d
          JOIN pipeline_stages ps ON ps.id=d.stage_id
          WHERE d.contact_id=? AND COALESCE(ps.is_won,0)=0 AND COALESCE(ps.is_lost,0)=0
          LIMIT 1
        `).get(contactId) as { id?: string } | undefined;
        if (!activeDeal?.id) {
          const firstStage = sqlite.prepare(`SELECT id FROM pipeline_stages WHERE COALESCE(is_won,0)=0 AND COALESCE(is_lost,0)=0 ORDER BY "order" ASC LIMIT 1`).get() as { id?: string } | undefined;
          if (firstStage?.id) {
            sqlite.prepare("INSERT INTO deals(id,title,value,stage_id,contact_id,probability,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
              .run(crypto.randomUUID(), decision.dealTitle || "Новая заявка", 0, firstStage.id, contactId, 20, decision.summary || null, Date.now(), Date.now());
          }
        }
      }

      if (decision.suggestedStage && decision.disposition !== "lost") {
        const target = sqlite.prepare("SELECT id FROM pipeline_stages WHERE lower(name)=lower(?) AND COALESCE(is_lost,0)=0 LIMIT 1").get(decision.suggestedStage) as { id?: string } | undefined;
        if (target?.id) {
          sqlite.prepare(`
            UPDATE deals SET stage_id=?,updated_at=?
            WHERE contact_id=? AND id IN (
              SELECT d.id FROM deals d
              JOIN pipeline_stages ps ON ps.id=d.stage_id
              WHERE d.contact_id=? AND COALESCE(ps.is_won,0)=0 AND COALESCE(ps.is_lost,0)=0
            )
          `).run(target.id, Date.now(), contactId, contactId);
        }
      }

      if (decision.nextStep && Number(decision.followUpHours || 0) > 0) {
        const scheduledAt = Date.now() + Math.min(24 * 14, Math.max(1, Number(decision.followUpHours))) * 3600000;
        const exists = sqlite.prepare("SELECT 1 FROM activities WHERE contact_id=? AND type='ai_followup' AND completed_at IS NULL AND scheduled_at>? LIMIT 1").get(contactId, Date.now());
        if (!exists) {
          sqlite.prepare("INSERT INTO activities(id,contact_id,type,description,priority,scheduled_at,created_at) VALUES(?,?,?,?,?,?,?)")
            .run(crypto.randomUUID(), contactId, "ai_followup", decision.nextStep, "normal", scheduledAt, Date.now());
        }
      }

      if (decision.disposition === "lost") {
        const stageId = lostStageId();
        if (stageId) {
          sqlite.prepare("UPDATE deals SET stage_id=?,loss_reason=?,updated_at=? WHERE contact_id=?")
            .run(stageId, decision.lossReason || decision.reason || "Отказ клиента", Date.now(), contactId);
        }
        sqlite.prepare("UPDATE contacts SET qualification='unqualified',updated_at=? WHERE id=?").run(Date.now(), contactId);
      }

      if (tableExists("activities")) {
        sqlite.prepare("INSERT INTO activities(id,contact_id,type,description,created_at) VALUES(?,?,?,?,?)")
          .run(crypto.randomUUID(), contactId, "ai_manager", `AI: ${decision.summary || decision.reason || decision.disposition || "обновлено"}`, Date.now());
      }
    })();
    applied = true;
  }

  return { configured: true, applied, decision };
}
