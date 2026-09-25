import Database from "better-sqlite3";
import path from "path";
import { analyzeContactWithAi } from "@/lib/ai-manager";
import { dealConversationContext } from "@/lib/deal-intelligence";
const sqlite=new Database(process.env.CRM_DB_PATH||path.join(process.cwd(),"data","crm.db"),{timeout:15000});
function norm(v:unknown){return String(v||"").toLowerCase().replace(/^\s*(re|fw|fwd):\s*/gi,"").replace(/\[ticket[^\]]*\]/gi,"").replace(/коммерческ(?:ое|ого)? предложение/gi,"").replace(/[^a-zа-яё0-9]+/gi," ").replace(/\s+/g," ").trim()}
function key(row:any){const title=norm(row.title);const notes=norm(row.notes);const email=norm(row.email);const company=norm(row.company);return company||title||notes.slice(0,80)||email}
export async function reconcileDeals(){
 const rows=sqlite.prepare(`SELECT d.id,d.title,d.notes,d.contact_id contactId,d.stage_id stageId,d.value,d.updated_at updatedAt,c.email,c.company FROM deals d LEFT JOIN contacts c ON c.id=d.contact_id ORDER BY d.updated_at DESC`).all() as any[];
 const groups=new Map<string,any[]>();for(const r of rows){const k=key(r);if(!k)continue;const a=groups.get(k)||[];a.push(r);groups.set(k,a)}
 let merged=0;
 for(const group of groups.values()){if(group.length<2)continue;const primary=group.sort((a,b)=>(Number(b.value>0)-Number(a.value>0))||b.updatedAt-a.updatedAt)[0];for(const dup of group){if(dup.id===primary.id)continue;
   try{sqlite.prepare("UPDATE email_threads SET contact_id=? WHERE contact_id=?").run(primary.contactId,dup.contactId)}catch{}
   try{sqlite.prepare("UPDATE client_documents SET contact_id=? WHERE contact_id=?").run(primary.contactId,dup.contactId)}catch{}
   try{sqlite.prepare("UPDATE activities SET contact_id=? WHERE contact_id=?").run(primary.contactId,dup.contactId)}catch{}
   if(!primary.value&&dup.value){sqlite.prepare("UPDATE deals SET value=? WHERE id=?").run(dup.value,primary.id);primary.value=dup.value}
   sqlite.prepare("DELETE FROM deals WHERE id=?").run(dup.id); merged++;
 }
 try{dealConversationContext(primary.id)}catch{}\n try{await analyzeContactWithAi(primary.contactId,{apply:true})}catch{}
 }
 // Re-evaluate every visible deal, not only duplicate groups. Old rows may contain stale inferred values/stages.\n for(const row of rows){try{dealConversationContext(row.id)}catch{} try{await analyzeContactWithAi(row.contactId,{apply:true})}catch{}}\n return {merged};
}
