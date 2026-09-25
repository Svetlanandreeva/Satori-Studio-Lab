import Database from "better-sqlite3";
import path from "path";
import { getOpenAiKey, openAiSettings, getOpenAiBaseUrl } from "@/lib/ai-settings";
import { analyzeContactWithAi } from "@/lib/ai-manager";

const sqlite=new Database(process.env.CRM_DB_PATH||process.env.DB_PATH||path.join(process.cwd(),"data","crm.db"));

function crmContext(){
 const contacts=sqlite.prepare("SELECT id,name,email,phone,source,qualification FROM contacts ORDER BY updated_at DESC LIMIT 80").all();
 const deals=sqlite.prepare(`SELECT d.id,d.title,d.value,d.contact_id AS contactId,ps.name AS stage FROM deals d LEFT JOIN pipeline_stages ps ON ps.id=d.stage_id ORDER BY d.updated_at DESC LIMIT 80`).all();
 return {contacts,deals};
}

export async function chatWithCrmManager(message:string){
 const key=getOpenAiKey(); if(!key) throw new Error("AI API не подключён");
 const settings=openAiSettings(); const base=getOpenAiBaseUrl();
 const context=crmContext();
 const system=`Ты AI-менеджер SATORI CRM. Отвечай по-русски кратко и по делу. Ты можешь анализировать CRM и предлагать действия. Если пользователь просит проверить/разобрать конкретного клиента, верни JSON {"reply":"...","contactId":"...","runAnalysis":true}. Не утверждай, что отправил файл, письмо, изменил оплату или удалил данные, если действие реально не выполнено. Отправка клиенту и финансовые изменения требуют подтверждения пользователя. Контекст CRM: ${JSON.stringify(context)}`;
 const official=base.includes("api.openai.com");
 const response=await fetch(official?`${base}/responses`:`${base}/chat/completions`,{
  method:"POST",
  headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
  body:JSON.stringify(official
   ? {model:settings.model,input:[{role:"system",content:[{type:"input_text",text:system}]},{role:"user",content:[{type:"input_text",text:message}]}],max_output_tokens:1200}
   : {model:settings.model,messages:[{role:"system",content:system},{role:"user",content:message}],temperature:0.2}
  )
 });
 if(!response.ok) throw new Error(`AI HTTP ${response.status}`);
 const data=await response.json() as any;
 const raw=official
  ? String(data.output_text||data.output?.flatMap((item:any)=>item.content||[]).map((part:any)=>part.text||"").join("")||"").trim()
  : String(data.choices?.[0]?.message?.content||"").trim();
 let parsed:any=null; try{parsed=JSON.parse(raw.replace(/^\`\`\`json\s*/,"").replace(/\`\`\`$/,""));}catch{}
 if(parsed?.runAnalysis&&parsed.contactId) await analyzeContactWithAi(String(parsed.contactId),{apply:true});
 return {reply:String(parsed?.reply||raw||"Готово.")};
}
