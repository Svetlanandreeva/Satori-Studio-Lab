import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getClientDocument, listClientDocuments } from "@/lib/client-documents";
import { getOpenAiKey, openAiSettings } from "@/lib/ai-settings";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const sqlite = new Database(DB_PATH, { timeout: 15000 });
try { sqlite.pragma("journal_mode = WAL"); } catch {}
try { sqlite.pragma("busy_timeout = 15000"); } catch {}

type AiDecision = {
  summary?: string;
  disposition?: "active" | "unprocessed" | "lost" | "won" | "production" | "unknown";
  reason?: string | null;
  nextStep?: string | null;
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
    ORDER BY COALESCE(is_lost,0) DESC, position DESC LIMIT 1
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
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text:
          "Ты AI-менеджер SATORI CRM. Анализируй только предоставленные факты. Верни ТОЛЬКО JSON: summary, disposition(active|unprocessed|lost|won|production|unknown), reason, nextStep, confidence(0..1), documentFacts. Не выдумывай. lost ставь только при явном отказе клиента. unprocessed — новый лид без содержательной обработки менеджером. Краткое summary должно сохранять суть запроса, цену/КП, сроки и причину отказа, если они известны." }] },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify(input) }] },
      ],
      text: { format: { type: "json_object" } },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI: ${response.status} ${(await response.text()).slice(0,300)}`);
  const json = await response.json() as Record<string, any>;
  const text = json.output_text || json.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==="output_text")?.text;
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
    const response = await fetch("https://api.openai.com/v1/responses", {
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
      if (decision.disposition === "lost") {
        const stageId = lostStageId();
        if (stageId) sqlite.prepare("UPDATE deals SET stage_id=?,updated_at=? WHERE contact_id=?").run(stageId, Date.now(), contactId);
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
