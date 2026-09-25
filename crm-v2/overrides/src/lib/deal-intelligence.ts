import Database from "better-sqlite3";
import path from "path";
const sqlite=new Database(process.env.CRM_DB_PATH||path.join(process.cwd(),"data","crm.db"),{timeout:15000});
function norm(v:unknown){return String(v||"").toLowerCase().replace(/\s+/g," ").trim()}
function tokens(v:unknown){return new Set(norm(v).replace(/[^a-zа-яё0-9 ]/gi," ").split(" ").filter(x=>x.length>3))}
function overlap(a:Set<string>,b:Set<string>){if(!a.size||!b.size)return 0;let n=0;for(const x of a)if(b.has(x))n++;return n/Math.min(a.size,b.size)}
export function dealConversationContext(dealId:string){
 const deal=sqlite.prepare(`SELECT d.*,c.name contactName,c.email contactEmail,c.phone contactPhone FROM deals d JOIN contacts c ON c.id=d.contact_id WHERE d.id=?`).get(dealId) as any;if(!deal)return null;
 const own=sqlite.prepare(`SELECT em.*,et.remote_email remoteEmail,et.contact_id contactId FROM email_messages em JOIN email_threads et ON et.id=em.thread_id WHERE et.contact_id=? ORDER BY em.received_at ASC`).all(deal.contact_id) as any[];
 const all=sqlite.prepare(`SELECT em.*,et.remote_email remoteEmail,et.contact_id contactId FROM email_messages em JOIN email_threads et ON et.id=em.thread_id WHERE em.received_at>? ORDER BY em.received_at ASC`).all(Number(deal.created_at)-45*86400000) as any[];
 const seed=tokens([deal.title,deal.notes,...own.map(x=>x.subject+" "+x.body_text)].join(" "));
 const related=all.filter(m=>m.contactId===deal.contact_id||overlap(seed,tokens(m.subject+" "+m.body_text))>=0.28);
 const payment=related.filter(m=>/оплачен|оплат[аи] (получена|прошла|поступила)|деньги поступили|payment received|paid/i.test(m.body_text+" "+m.subject)).sort((a,b)=>b.received_at-a.received_at)[0]||null;
 const duplicateContacts=Array.from(new Set(related.map(m=>m.contactId).filter((x:any)=>x&&x!==deal.contact_id)));
 return {deal,relatedMessages:related.slice(-180),paymentEvidence:payment?{text:String(payment.body_text).slice(0,600),date:payment.received_at,email:payment.remoteEmail}:null,duplicateContactIds:duplicateContacts};
}
