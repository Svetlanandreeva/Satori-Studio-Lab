import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getClientDocument, listClientDocuments } from "@/lib/client-documents";
import { getOpenAiKey, getOpenAiBaseUrl, openAiSettings } from "@/lib/ai-settings";

const DB_PATH=process.env.CRM_DB_PATH||path.join(process.cwd(),"data","crm.db");
const sqlite=new Database(DB_PATH,{timeout:15000});
try{sqlite.pragma("journal_mode = WAL")}catch{}
try{sqlite.pragma("busy_timeout = 15000")}catch{}

sqlite.exec(`
 CREATE TABLE IF NOT EXISTS contact_intelligence(
   contact_id TEXT PRIMARY KEY,
   summary TEXT,
   extracted_at INTEGER NOT NULL,
   auto_updates INTEGER NOT NULL DEFAULT 0,
   evidence_count INTEGER NOT NULL DEFAULT 0
 );
`);

function tableExists(name:string){return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))}
function cleanText(value:unknown){return String(value||"").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<br\s*\/?\s*>/gi,"\n").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&amp;/gi,"&").replace(/\r/g,"").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim().slice(0,120000)}
function conversation(contactId:string){
 const telegram=tableExists("activities")?(sqlite.prepare(`SELECT type,description,created_at AS createdAt FROM activities WHERE contact_id=? AND lower(type) LIKE '%telegram%' ORDER BY created_at DESC LIMIT 120`).all(contactId) as any[]).reverse().map(x=>({...x,description:cleanText(x.description)})):[];
 const emails=tableExists("email_threads")&&tableExists("email_messages")?(sqlite.prepare(`SELECT 'email' type,em.direction,em.subject,em.body_text description,em.received_at createdAt FROM email_messages em JOIN email_threads et ON et.id=em.thread_id WHERE et.contact_id=? AND COALESCE(et.is_service,0)=0 ORDER BY em.received_at DESC LIMIT 180`).all(contactId) as any[]).reverse().map(x=>({...x,description:cleanText(x.description)})):[];
 return [...telegram,...emails].sort((a:any,b:any)=>Number(a.createdAt)-Number(b.createdAt)).slice(-220);
}
async function documentInput(documentId:string,contactId:string){
 const doc=getClientDocument(documentId,contactId);if(!doc)return null;
 const ext=path.extname(doc.filePath).toLowerCase();
 if(ext===".txt"||ext===".csv")return{name:doc.name,kind:doc.kind,text:fs.readFileSync(doc.filePath,"utf8").slice(0,120000)};
 return{name:doc.name,kind:doc.kind,note:"Документ есть в карточке клиента; данные из него не используются для автоматического изменения сделки."};
}
async function askAi(payload:unknown){
 const key=getOpenAiKey();if(!key)return null;
 const base=getOpenAiBaseUrl(),model=openAiSettings().model,official=base.includes("api.openai.com");
 const system=`Ты помощник Satori CRM. Твоя единственная задача — кратко пересказать переписку и документы клиента своими словами. Ничего не меняй и не решай в CRM: не создавай сделки, не меняй статус, суммы, квалификацию, оплату, задачи или ответственного. Верни только JSON {"summary":"...","confidence":0..1}. summary: что хочет клиент, что предложили мы, какие суммы/условия обсуждались, на чём остановился диалог. Без HTML, цитат писем и технических ID. Не смешивай клиентов.`;
 const response=await fetch(official?`${base}/responses`:`${base}/chat/completions`,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(official?{model,input:[{role:"system",content:[{type:"input_text",text:system}]},{role:"user",content:[{type:"input_text",text:JSON.stringify(payload)}]}],text:{format:{type:"json_object"}}}:{model,messages:[{role:"system",content:system},{role:"user",content:JSON.stringify(payload)}],response_format:{type:"json_object"}})});
 if(!response.ok)throw new Error(`AI API: ${response.status} ${(await response.text()).slice(0,250)}`);
 const json=await response.json() as any;
 const text=official?json.output_text||json.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==="output_text")?.text:json.choices?.[0]?.message?.content;
 return text?JSON.parse(text):null;
}

export async function analyzeContactWithAi(contactId:string,options:{documentId?:string;apply?:boolean}={}){
 const contact=sqlite.prepare("SELECT id,name,email,phone,company,source,qualification FROM contacts WHERE id=?").get(contactId) as any;
 if(!contact)throw new Error("Клиент не найден");
 const documents=listClientDocuments(contactId).map(d=>({id:d.id,name:d.name,kind:d.kind,createdAt:d.createdAt}));
 const selected=options.documentId?await documentInput(options.documentId,contactId):null;
 const payload={contact,conversation:conversation(contactId),documents,selectedDocument:selected};
 const decision=await askAi(payload);
 if(!decision)return{configured:false,applied:false,message:"AI API не подключён",context:payload};
 const summary=String(decision.summary||"").trim();
 const confidence=Math.max(0,Math.min(1,Number(decision.confidence||0)));
 if(summary){sqlite.prepare(`INSERT INTO contact_intelligence(contact_id,summary,extracted_at,auto_updates,evidence_count) VALUES(?,?,?,1,1) ON CONFLICT(contact_id) DO UPDATE SET summary=excluded.summary,extracted_at=excluded.extracted_at,auto_updates=contact_intelligence.auto_updates+1`).run(contactId,summary,Date.now())}
 return{configured:true,applied:Boolean(summary),decision:{summary,confidence}};
}
