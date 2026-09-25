import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
const sqlite=new Database(process.env.CRM_DB_PATH||path.join(process.cwd(),"data","crm.db"),{timeout:15000});
function norm(v:unknown){return String(v||"").toLowerCase().replace(/\s+/g," ").trim()}
function tokens(v:unknown){return new Set(norm(v).replace(/[^a-zа-яё0-9 ]/gi," ").split(" ").filter(x=>x.length>3))}
function overlap(a:Set<string>,b:Set<string>){if(!a.size||!b.size)return 0;let n=0;for(const x of a)if(b.has(x))n++;return n/Math.min(a.size,b.size)}
function ts(v:any){if(v instanceof Date)return v.getTime();const n=Number(v);if(Number.isFinite(n)&&n>100000000000)return n;if(Number.isFinite(n)&&n>1000000000)return n*1000;const d=Date.parse(String(v||""));return Number.isFinite(d)?d:0}
function paymentSignal(text:string){return /(?:оплат(?:а|у|или|ил|ила|ено|или полностью)|счет оплачен|плат[её]ж (?:прош[её]л|отправлен|проведен)|деньги (?:перевели|отправили|поступили)|перевел[аи]?|payment (?:sent|made|completed)|paid)/i.test(text)}
function futurePayment(text:string){return /(?:до оплаты|оплатим|оплачу|оплатят|ждем оплат|ожидаем оплат|счет передан|оплата завтра|после оплаты|на оплате)/i.test(text)}
function amounts(text:string){const out:number[]=[];const re=/(?:итого|стоимость|сумма|цена|к оплате|предоплата|счет(?:а)? на)\s*[:—-]?\s*(\d[\d\s]{2,10})(?:[,.]\d{1,2})?\s*(?:₽|руб(?:\.|лей|ля)?|rub)/gi;for(const m of text.matchAll(re)){const n=Number(m[1].replace(/\s/g,""));if(n>=100&&n<=10000000)out.push(Math.round(n*100))}return out}
function documentText(contactIds:string[]){if(!contactIds.length)return "";const qs=contactIds.map(()=>"?").join(",");const docs=sqlite.prepare(`SELECT stored_name,name,mime_type FROM client_documents WHERE contact_id IN (${qs}) ORDER BY created_at DESC LIMIT 40`).all(...contactIds) as any[];let out="";for(const d of docs){const ext=path.extname(d.stored_name||"").toLowerCase();if(![".txt",".csv"].includes(ext))continue;try{out+="\n"+d.name+"\n"+fs.readFileSync(path.join(path.dirname(process.env.CRM_DB_PATH||path.join(process.cwd(),"data","crm.db")),"client-files",d.stored_name),"utf8").slice(0,100000)}catch{}}return out}
export function dealConversationContext(dealId:string){
 const deal=sqlite.prepare(`SELECT d.*,c.name contactName,c.email contactEmail,c.phone contactPhone FROM deals d JOIN contacts c ON c.id=d.contact_id WHERE d.id=?`).get(dealId) as any;if(!deal)return null;
 const own=sqlite.prepare(`SELECT em.*,et.remote_email remoteEmail,et.contact_id contactId FROM email_messages em JOIN email_threads et ON et.id=em.thread_id WHERE et.contact_id=? ORDER BY em.received_at ASC`).all(deal.contact_id) as any[];
 const all=sqlite.prepare(`SELECT em.*,et.remote_email remoteEmail,et.contact_id contactId FROM email_messages em JOIN email_threads et ON et.id=em.thread_id WHERE em.received_at>? ORDER BY em.received_at ASC`).all(Number(deal.created_at)-45*86400000) as any[];
 const seed=tokens([deal.title,deal.notes,...own.map(x=>x.subject+" "+x.body_text)].join(" "));
 const related=all.filter(m=>m.contactId===deal.contact_id||overlap(seed,tokens(m.subject+" "+m.body_text))>=0.28);
 const duplicateContacts=Array.from(new Set(related.map(m=>m.contactId).filter((x:any)=>x&&x!==deal.contact_id))) as string[];
 const contactIds=[deal.contact_id,...duplicateContacts];
 const docText=documentText(contactIds);
 const corpus=[deal.title,deal.notes,...related.map(m=>m.subject+" "+m.body_text),docText].join("\n");
 const foundAmounts=amounts(corpus); const counts=new Map<number,number>();for(const n of foundAmounts)counts.set(n,(counts.get(n)||0)+1);const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]);const detectedAmount=ranked.length&&(ranked[0][1]>=2||Boolean(docText))?ranked[0][0]:0;
 const payment=related.filter(m=>{const t=String(m.body_text||"")+" "+String(m.subject||"");return paymentSignal(t)&&!futurePayment(t)}).sort((a,b)=>ts(b.received_at)-ts(a.received_at))[0]||null;
 const paymentDoc=sqlite.prepare(`SELECT * FROM client_documents WHERE contact_id IN (${contactIds.map(()=>"?").join(",")}) AND source_direction='incoming' AND (lower(name) LIKE '%чек%' OR lower(name) LIKE '%оплат%' OR lower(name) LIKE '%receipt%' OR lower(name) LIKE '%payment%' OR lower(name) LIKE '%платеж%') ORDER BY created_at DESC LIMIT 1`).get(...contactIds) as any;
 const anyIncomingDoc=sqlite.prepare(`SELECT * FROM client_documents WHERE contact_id IN (${contactIds.map(()=>"?").join(",")}) AND source_direction='incoming' ORDER BY created_at DESC LIMIT 1`).get(...contactIds) as any;
 const verifiedPaymentDoc=paymentDoc || (payment && anyIncomingDoc && /(?:счет|invoice|платеж|чек|payment|receipt|pdf)/i.test(String(anyIncomingDoc.name||"")) ? anyIncomingDoc : null);
 // Never write an amount merely because a currency-looking number appeared in conversation.\n // It must be explicitly labelled and corroborated by a second occurrence or readable client document.\n if(detectedAmount>0 && Number(deal.value||0)<=0) sqlite.prepare("UPDATE deals SET value=?,updated_at=? WHERE id=?").run(detectedAmount,Date.now(),dealId);
 if(payment&&verifiedPaymentDoc){
   const amount=detectedAmount||Number(deal.value||0); const paidStage=sqlite.prepare(`SELECT id FROM pipeline_stages WHERE lower(name) LIKE '%оплач%' ORDER BY "order" LIMIT 1`).get() as any;
   if(amount>0) sqlite.prepare(`INSERT INTO deal_economics(deal_id,received_amount,updated_at) VALUES(?,?,?) ON CONFLICT(deal_id) DO UPDATE SET received_amount=MAX(received_amount,excluded.received_amount),updated_at=excluded.updated_at`).run(dealId,amount,ts(payment.received_at));
   if(paidStage?.id) sqlite.prepare("UPDATE deals SET stage_id=?,updated_at=? WHERE id=?").run(paidStage.id,Number(payment.received_at),dealId);
 }
 return {deal:{...deal,value:detectedAmount||deal.value},detectedAmount,relatedMessages:related.slice(-180),paymentEvidence:payment?{text:String(payment.body_text).slice(0,600),date:ts(payment.received_at),email:payment.remoteEmail,document:verifiedPaymentDoc?.name||null,autoApplied:Boolean(verifiedPaymentDoc)}:null,duplicateContactIds:duplicateContacts};
}
