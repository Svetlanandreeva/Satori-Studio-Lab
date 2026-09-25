import Database from "better-sqlite3";
import path from "path";
import { getOpenAiBaseUrl, getOpenAiKey, openAiSettings } from "@/lib/ai-settings";
import { cleanEmailDisplayBody } from "@/lib/email-crm-policy";

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

type DealAiDecision = { summary?: string; confidence?: number };

function words(value: unknown) {
  return new Set(String(value || "").toLowerCase().replace(/[^a-zа-яё0-9]+/gi, " ").split(/\s+/).filter((x) => x.length > 3));
}
function similarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n += 1;
  return n / Math.min(a.size, b.size);
}
function currentIntelligence(dealId: string) {
  return sqlite.prepare(`SELECT summary,source_thread_id AS sourceThreadId,confidence,updated_at AS updatedAt FROM deal_ai_intelligence WHERE deal_id=?`).get(dealId) as any || null;
}
function chooseThread(deal: any) {
  const current = currentIntelligence(deal.id);
  if (current?.sourceThreadId) {
    const same = sqlite.prepare(`SELECT * FROM email_threads WHERE id=? AND contact_id=? AND COALESCE(is_service,0)=0`).get(current.sourceThreadId, deal.contact_id) as any;
    if (same) return same;
  }
  const threads = sqlite.prepare(`SELECT * FROM email_threads WHERE contact_id=? AND COALESCE(is_service,0)=0 ORDER BY last_message_at DESC`).all(deal.contact_id) as any[];
  if (!threads.length) return null;
  if (threads.length === 1) return threads[0];
  const dealWords = words(deal.title);
  return [...threads].sort((a,b)=>similarity(dealWords,words(b.subject))-similarity(dealWords,words(a.subject)) || Number(b.last_message_at)-Number(a.last_message_at))[0];
}
function threadConversation(threadId: string) {
  return (sqlite.prepare(`SELECT direction,subject,body_text AS bodyText,received_at AS receivedAt FROM email_messages WHERE thread_id=? ORDER BY received_at ASC LIMIT 240`).all(threadId) as any[])
    .map((m)=>({direction:m.direction,subject:String(m.subject||""),text:cleanEmailDisplayBody(m.bodyText),receivedAt:Number(m.receivedAt)}))
    .filter((m)=>m.text||m.subject);
}

async function askAi(payload: unknown): Promise<DealAiDecision> {
  const key=getOpenAiKey();
  if(!key) throw new Error("AI API не подключён");
  const base=getOpenAiBaseUrl();
  const model=openAiSettings().model;
  const system=`Ты делаешь только краткую заметку по одной сделке Satori CRM. Ничего в CRM не решай и не меняй: не выбирай статус, не записывай сумму в поля, не создавай задачи. Проанализируй только переданную переписку и верни JSON с summary и confidence. summary пиши своими словами, без цитат, HTML, email-заголовков и технических ID. Формат строго 4 коротких абзаца:\nЧто хочет клиент: ...\nЧто предложили мы: ...\nДеньги: какие суммы и условия реально обсуждались, либо «не зафиксировано».\nСейчас: на чём фактически остановился диалог и чего ждём. Не выдумывай факты.`;
  const official=base.includes("api.openai.com");
  const response=await fetch(official?`${base}/responses`:`${base}/chat/completions`,{
    method:"POST",
    headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
    body:JSON.stringify(official?{
      model,
      input:[{role:"system",content:[{type:"input_text",text:system}]},{role:"user",content:[{type:"input_text",text:JSON.stringify(payload)}]}],
      text:{format:{type:"json_object"}},
    }:{
      model,
      messages:[{role:"system",content:system},{role:"user",content:JSON.stringify(payload)}],
      response_format:{type:"json_object"},
    }),
  });
  if(!response.ok) throw new Error(`AI API: ${response.status} ${(await response.text()).slice(0,250)}`);
  const json=await response.json() as any;
  const text=official?json.output_text||json.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==="output_text")?.text:json.choices?.[0]?.message?.content;
  if(!text) throw new Error("AI не вернул результат");
  return JSON.parse(text) as DealAiDecision;
}

export function getDealAiSummary(dealId:string){return currentIntelligence(dealId)}

export function dealAiNeedsRefresh(dealId:string){
  const deal=sqlite.prepare(`SELECT * FROM deals WHERE id=?`).get(dealId) as any;
  if(!deal) return false;
  const thread=chooseThread(deal);
  if(!thread) return false;
  const current=currentIntelligence(dealId);
  return !current||Number(current.updatedAt||0)<Number(thread.last_message_at||0);
}

export async function analyzeDealWithAi(dealId:string,_apply=true){
  const deal=sqlite.prepare(`SELECT d.*,c.name AS contactName,c.company AS contactCompany FROM deals d JOIN contacts c ON c.id=d.contact_id WHERE d.id=?`).get(dealId) as any;
  if(!deal) throw new Error("Сделка не найдена");
  const thread=chooseThread(deal);
  if(!thread) return {analyzed:false,reason:"У сделки нет отдельной клиентской переписки"};
  const conversation=threadConversation(thread.id);
  if(!conversation.length) return {analyzed:false,reason:"Переписка пуста"};
  const decision=await askAi({deal:{id:deal.id,title:deal.title,contactName:deal.contactName,contactCompany:deal.contactCompany},thread:{subject:thread.subject,remoteEmail:thread.remote_email},conversation});
  const confidence=Math.max(0,Math.min(1,Number(decision.confidence||0)));
  const summary=String(decision.summary||"").trim();
  const now=Date.now();
  sqlite.prepare(`INSERT INTO deal_ai_intelligence(deal_id,summary,source_thread_id,confidence,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(deal_id) DO UPDATE SET summary=excluded.summary,source_thread_id=excluded.source_thread_id,confidence=excluded.confidence,updated_at=excluded.updated_at`).run(dealId,summary||null,thread.id,confidence,now);
  if(summary) sqlite.prepare(`UPDATE deals SET notes=?,updated_at=? WHERE id=?`).run(summary,now,dealId);
  return {analyzed:true,decision:{summary,confidence},threadId:thread.id};
}
