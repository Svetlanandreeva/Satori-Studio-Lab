import Database from "better-sqlite3";
import path from "path";

const sqlite=new Database(process.env.CRM_DB_PATH||path.join(process.cwd(),"data","crm.db"),{timeout:15000});

function normalizedTitle(value:unknown){return String(value||"").toLowerCase().replace(/^\s*(re|fw|fwd):\s*/gi,"").replace(/\[ticket[^\]]*\]/gi,"").replace(/коммерческ(?:ое|ого)? предложение/gi,"").replace(/[^a-zа-яё0-9]+/gi," ").replace(/\s+/g," ").trim()}
function generic(title:string){return !title||["запрос","запрос кп","новая заявка","заказ","кп"].includes(title)}

export function reconcileDeals(){
 const rows=sqlite.prepare(`SELECT d.id,d.title,d.contact_id AS contactId,d.value,d.updated_at AS updatedAt FROM deals d ORDER BY d.updated_at DESC`).all() as any[];
 const groups=new Map<string,any[]>();
 for(const row of rows){
   const title=normalizedTitle(row.title);
   if(generic(title))continue;
   // Merge only provable duplicates: same client card + same normalized deal title.
   // Never merge different contacts merely because the wording looks similar.
   const key=`${row.contactId}:${title}`;
   const group=groups.get(key)||[];group.push(row);groups.set(key,group);
 }
 let merged=0;
 for(const group of groups.values()){
   if(group.length<2)continue;
   // Keep the record with a manually entered amount first; otherwise the newest.
   const primary=[...group].sort((a,b)=>Number(Boolean(b.value))-Number(Boolean(a.value))||Number(b.updatedAt)-Number(a.updatedAt))[0];
   for(const duplicate of group){
     if(duplicate.id===primary.id)continue;
     // Preserve history/documents on the contact. Only the duplicate deal row is removed.
     sqlite.prepare("DELETE FROM deals WHERE id=?").run(duplicate.id);
     merged+=1;
   }
 }
 return{merged};
}
