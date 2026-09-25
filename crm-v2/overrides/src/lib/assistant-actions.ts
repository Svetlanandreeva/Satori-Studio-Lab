import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getClientDocument } from "@/lib/client-documents";
import { sendTelegramDocument } from "@/lib/telegram-send-document";
import { replyToEmailThread } from "@/lib/email-integration";

const DB_PATH=process.env.CRM_DB_PATH||process.env.DB_PATH||path.join(process.cwd(),"data","crm.db");
const sqlite=new Database(DB_PATH,{timeout:15000});

function telegramMeta(notes: unknown){
 const raw=String(notes||"");
 return {
  chatId:raw.match(/\[telegram-chat:([^\]]+)\]/)?.[1]||null,
  businessConnectionId:raw.match(/\[telegram-business:([^\]]+)\]/)?.[1]||null,
 };
}

export function prepareDocumentDelivery(contactId:string,documentId:string){
 const doc=getClientDocument(documentId,contactId); if(!doc) throw new Error("Документ не найден");
 const contact=sqlite.prepare("SELECT id,name,email,notes FROM contacts WHERE id=?").get(contactId) as any;
 if(!contact) throw new Error("Клиент не найден");
 const tg=telegramMeta(contact.notes);
 return {requiresConfirmation:true,contact:{id:contact.id,name:contact.name,email:contact.email,telegramChatId:tg.chatId},document:{id:doc.id,name:doc.name,kind:doc.kind,sizeBytes:doc.sizeBytes,previewUrl:`/api/contacts/${contactId}/documents/${documentId}`},actions:["send_document"]};
}

export async function confirmDocumentDelivery(input:{contactId:string;documentId:string;channel:"telegram"|"email";threadId?:string;caption?:string}){
 const doc=getClientDocument(input.documentId,input.contactId); if(!doc) throw new Error("Документ не найден");
 const bytes=new Uint8Array(fs.readFileSync(doc.filePath));
 if(input.channel==="telegram"){
   const contact=sqlite.prepare("SELECT notes FROM contacts WHERE id=?").get(input.contactId) as any;
   const tg=telegramMeta(contact?.notes);
   if(!tg.chatId) throw new Error("У клиента нет Telegram-чата");
   const sent=await sendTelegramDocument({chatId:String(tg.chatId),filename:doc.name,bytes,mimeType:doc.mimeType,caption:input.caption||null,businessConnectionId:tg.businessConnectionId});
   if(!sent.sent) throw new Error(sent.error||"Не удалось отправить файл");
 }else{
   if(!input.threadId) throw new Error("Не выбран email-диалог клиента");
   await replyToEmailThread(input.threadId,input.caption||"",[{filename:doc.name,content:bytes,contentType:doc.mimeType}]);
 }
 sqlite.prepare("INSERT INTO activities(id,contact_id,type,description,created_at) VALUES(?,?,?,?,?)").run(crypto.randomUUID(),input.contactId,"ai_manager",`Документ «${doc.name}» отправлен клиенту через ${input.channel}`,Date.now());
 return {sent:true};
}

export function preparePaymentConfirmation(dealId:string,amount:number,evidence:string){
 const deal=sqlite.prepare("SELECT d.id,d.title,d.value,c.name AS contactName FROM deals d LEFT JOIN contacts c ON c.id=d.contact_id WHERE d.id=?").get(dealId) as any;
 if(!deal) throw new Error("Сделка не найдена");
 return {requiresConfirmation:true,action:"confirm_payment",deal,amount:Math.max(0,Math.round(amount)),evidence:String(evidence||"").slice(0,500)};
}

export function confirmPayment(dealId:string,amount:number,evidence:string){
 const deal=sqlite.prepare("SELECT id,contact_id AS contactId FROM deals WHERE id=?").get(dealId) as any; if(!deal) throw new Error("Сделка не найдена");
 const paid=Math.max(0,Math.round(amount)); const now=Date.now();
 sqlite.prepare(`INSERT INTO deal_economics(deal_id,received_amount,updated_at) VALUES(?,?,?) ON CONFLICT(deal_id) DO UPDATE SET received_amount=excluded.received_amount,updated_at=excluded.updated_at`).run(dealId,paid,now);
 const paidStage=sqlite.prepare(`SELECT id FROM pipeline_stages WHERE lower(name) LIKE '%оплач%' ORDER BY "order" LIMIT 1`).get() as any;
 if(paidStage?.id) sqlite.prepare("UPDATE deals SET stage_id=?,updated_at=? WHERE id=?").run(paidStage.id,now,dealId);
 if(deal.contactId) sqlite.prepare("INSERT INTO activities(id,contact_id,deal_id,type,description,created_at) VALUES(?,?,?,?,?,?)").run(crypto.randomUUID(),deal.contactId,dealId,"ai_manager",`Оплата подтверждена: ${(paid/100).toLocaleString("ru-RU")} ₽. Основание: ${String(evidence||"подтверждено пользователем").slice(0,400)}`,now);
 return {confirmed:true,amount:paid,movedToPaid:Boolean(paidStage?.id)};
}
