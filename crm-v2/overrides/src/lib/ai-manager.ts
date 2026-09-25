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
};

function tableExists(name: string) {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
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
  return sqlite.prepare(`
    SELECT type,description,created_at AS createdAt FROM activities
    WHERE contact_id=? AND (lower(type) LIKE '%telegram%' OR lower(type) LIKE '%email%')
    ORDER BY created_at ASC LIMIT 160
  `).all(contactId);
}

async function callOpenAI(input: unknown): Promise<AiDecision | null> {
  const key = getOpenAiKey();
  if (!key) return null;
  const model = openAiSettings().model;
  const baseUrl = getOpenAiBaseUrl();
  const system = "Ты AI-менеджер SATORI CRM. Анализируй только предоставленные факты. Верни ТОЛЬКО JSON: summary, disposition(active|unprocessed|lost|won|production|unknown), reason, nextStep, hasApplication, lossReason, suggestedStage, followUpHours, confidence(0..1), documentFacts. Не выдумывай. hasApplication=true только если клиент реально сформулировал запрос/заявку на товар, производство, расчёт, КП или заказ; сам факт попадания из Need Number заявкой не является. lost ставь только при явном отказе клиента и обязательно заполни lossReason. suggestedStage выбирай по фактическому состоянию диалога. followUpHours укажи, если из контекста следует, когда уместно мягко напомнить клиенту; иначе null. Краткое summary сохраняет суть запроса, цену/КП, сроки и причину отказа.";
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
      messages: [{role:"system",content:system},{role:"user",content:JSON.stringify(input)}],
      response_format:{type:"json_object"}
    }),
  });
  if (!response.ok) throw new Error(`AI API: ${response.status} ${(await response.text()).slice(0,300)}`);
  const json = await response.json() as Record<string, any>;
  const text = official
    ? json.output_text || json.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==="output_text")?.text
    : json.choices?.[0]?.message?.content;
  return text ? JSON.parse(text) as AiDecision : null;
}
async function documentInput(documentId: string, contactId: string) {
  const doc = getClientDocument(documentId, contactId);
  if (!doc) return null;
  const ext = path.extname(doc.filePath).toLowerCase();
  if (ext === ".txt" || ext === ".csv") {
    return { name: doc.name, kind: doc.kind, text: fs.readFileSync(doc.filePath, "utf8").slice(0,120000) };
  }
  // PDFs/images can be sent to Responses API as base64 input_file.
  if ([".pdf",".png",".jpg",".jpeg",".webp"].includes(ext) && fs.statSync(doc.filePath).size <= 18*1024*1024) {
    const bytes = fs.readFileSync(doc.filePath).toString("base64");
    return { name: doc.name, kind: doc.kind, dataUrl: `data:${doc.mimeType || "application/octet-stream"};base64,${bytes}` };
  }
  return { name: doc.name, kind: doc.kind, note: "Файл сохранён в CRM; автоматическое чтение этого формата будет добавлено отдельно." };
}

export async function analyzeContactWithAi(contactId: string, options: { documentId?: string; apply?: boolean } = {}) {
  const contact = sqlite.prepare("SELECT * FROM contacts WHERE id=?").get(contactId) as Record<string, unknown> | undefined;
  if (!contact) throw new Error("Клиент не найден");
  const deals = sqlite.prepare(`SELECT d.*,ps.name AS stageName,ps.is_lost AS isLost,ps.is_won AS isWon
    FROM deals d JOIN pipeline_stages ps ON ps.id=d.stage_id WHERE d.contact_id=? ORDER BY d.updated_at DESC`).all(contactId);
  const docs = listClientDocuments(contactId).map(x => ({ id:x.id,name:x.name,kind:x.kind,createdAt:x.createdAt }));
  const selected = options.documentId ? await documentInput(options.documentId, contactId) : null;

  const payload: any = { contact, deals, conversation: conversation(contactId), documents: docs, selectedDocument: selected && !("dataUrl" in selected) ? selected : selected ? { name:selected.name,kind:selected.kind } : null };
  const key = getOpenAiKey();
  if (!key) return { configured:false, applied:false, message:"Добавьте OPENAI_API_KEY на сервер", context:payload };

  let decision: AiDecision | null;
  if (selected && "dataUrl" in selected) {
    const model = openAiSettings().model;
    const response = await fetch(`${getOpenAiBaseUrl()}/responses`, {
      method:"POST", headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify({model,input:[{role:"system",content:[{type:"input_text",text:"Ты AI-менеджер SATORI CRM. Прочитай карточку, переписку и документ. Верни только JSON с полями summary, disposition, reason, nextStep, confidence, documentFacts. Не выдумывай факты."}]},{role:"user",content:[{type:"input_text",text:JSON.stringify(payload)},{type:"input_file",filename:selected.name,file_data:selected.dataUrl}]}],text:{format:{type:"json_object"}}})
    });
    if(!response.ok) throw new Error(`OpenAI: ${response.status} ${(await response.text()).slice(0,300)}`);
    const json=await response.json() as any; const t=json.output_text || json.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==="output_text")?.text;
    decision=t?JSON.parse(t):null;
  } else decision = await callOpenAI(payload);

  if (!decision) throw new Error("AI не вернул результат");
  const confidence = Number(decision.confidence || 0);
  let applied = false;

  if (options.apply && confidence >= 0.82) {
    sqlite.transaction(() => {
      if (decision.summary) {
        sqlite.prepare(`INSERT INTO contact_intelligence(contact_id,summary,extracted_at,auto_updates,evidence_count)
          VALUES(?,?,?,1,1) ON CONFLICT(contact_id) DO UPDATE SET summary=excluded.summary,extracted_at=excluded.extracted_at,auto_updates=contact_intelligence.auto_updates+1`)
          .run(contactId, decision.summary, Date.now());
      }
      if (decision.hasApplication === true) {
        sqlite.prepare("UPDATE contacts SET qualification='qualified',updated_at=? WHERE id=?").run(Date.now(), contactId);
        const activeDeal = sqlite.prepare(`SELECT d.id FROM deals d JOIN pipeline_stages ps ON ps.id=d.stage_id WHERE d.contact_id=? AND COALESCE(ps.is_won,0)=0 AND COALESCE(ps.is_lost,0)=0 LIMIT 1`).get(contactId) as {id?:string}|undefined;
        if (!activeDeal?.id) {
          const firstStage = sqlite.prepare(`SELECT id FROM pipeline_stages WHERE COALESCE(is_won,0)=0 AND COALESCE(is_lost,0)=0 ORDER BY "order" ASC LIMIT 1`).get() as {id?:string}|undefined;
          if (firstStage?.id) sqlite.prepare("INSERT INTO deals(id,title,value,stage_id,contact_id,probability,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
            .run(crypto.randomUUID(), decision.summary?.slice(0,100) || "Новая заявка", 0, firstStage.id, contactId, 20, decision.nextStep || null, Date.now(), Date.now());
        }
      }
      if (decision.suggestedStage && decision.disposition !== "lost") {
        const target = sqlite.prepare("SELECT id FROM pipeline_stages WHERE lower(name)=lower(?) AND COALESCE(is_lost,0)=0 LIMIT 1").get(decision.suggestedStage) as {id?:string}|undefined;
        if (target?.id) sqlite.prepare(`UPDATE deals SET stage_id=?,updated_at=? WHERE contact_id=? AND id IN (SELECT d.id FROM deals d JOIN pipeline_stages ps ON ps.id=d.stage_id WHERE d.contact_id=? AND COALESCE(ps.is_won,0)=0 AND COALESCE(ps.is_lost,0)=0)`).run(target.id, Date.now(), contactId, contactId);
      }
      if (decision.nextStep && Number(decision.followUpHours || 0) > 0) {
        const scheduledAt = Date.now() + Math.min(24*14, Math.max(1, Number(decision.followUpHours))) * 3600000;
        const exists = sqlite.prepare("SELECT 1 FROM activities WHERE contact_id=? AND type='ai_followup' AND completed_at IS NULL AND scheduled_at>? LIMIT 1").get(contactId, Date.now());
        if (!exists) sqlite.prepare("INSERT INTO activities(id,contact_id,type,description,priority,scheduled_at,created_at) VALUES(?,?,?,?,?,?,?)")
          .run(crypto.randomUUID(), contactId, "ai_followup", decision.nextStep, "normal", scheduledAt, Date.now());
      }
      if (decision.disposition === "lost") {
        const stageId = lostStageId();
        if (stageId) sqlite.prepare("UPDATE deals SET stage_id=?,loss_reason=?,updated_at=? WHERE contact_id=?")
          .run(stageId, decision.lossReason || decision.reason || "Отказ клиента", Date.now(), contactId);
        sqlite.prepare("UPDATE contacts SET qualification='unqualified',updated_at=? WHERE id=?").run(Date.now(), contactId);
      }
      if (tableExists("activities")) {
        sqlite.prepare("INSERT INTO activities(id,contact_id,type,description,created_at) VALUES(?,?,?,?,?)")
          .run(crypto.randomUUID(), contactId, "ai_manager", `AI: ${decision.summary || decision.reason || decision.disposition || "обновлено"}`, Date.now());
      }
    })();
    applied = true;
  }
  return { configured:true, applied, decision };
}
