import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deals, pipelineStages } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { reconcileDeals } from "@/lib/deal-reconcile";

export const dynamic="force-dynamic";
function money(v:number){return new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format((Number(v)||0)/100)}
function date(v:Date|number){return new Intl.DateTimeFormat("ru-RU").format(v instanceof Date?v:new Date(v))}

export default async function DealsPage(){
 reconcileDeals();
 const rows=db.select({id:deals.id,title:deals.title,value:deals.value,createdAt:deals.createdAt,updatedAt:deals.updatedAt,contactName:contacts.name,contactSource:contacts.source,qualification:contacts.qualification,stageName:pipelineStages.name,stageColor:pipelineStages.color,isLost:pipelineStages.isLost,notes:deals.notes})
 .from(deals).leftJoin(contacts,eq(deals.contactId,contacts.id)).leftJoin(pipelineStages,eq(deals.stageId,pipelineStages.id)).orderBy(desc(deals.updatedAt)).all().filter(d=>{
   if(d.contactSource==="need_number"||["spam","unqualified","ignore"].includes(String(d.qualification||"").toLowerCase())) return false;
   const hay=(String(d.title||"")+" "+String(d.contactName||"")+" "+String(d.notes||"")).toLowerCase();
   if(/elama|e-lama|ai-маркетолог|ticket#|mailer-daemon|no-reply|noreply/.test(hay)) return false;
   return true;
 });
 return <div className="mx-auto max-w-[1480px] space-y-5 pb-10">
  <div><h1 className="text-3xl font-semibold tracking-tight">Сделки</h1><p className="mt-1 text-sm text-slate-500">Все заказы в одном списке: дата, клиент, статус и сумма.</p></div>
  <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
   <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Дата</th><th className="px-5 py-3">Название</th><th className="px-5 py-3">Статус</th><th className="px-5 py-3 text-right">Сумма</th><th className="px-5 py-3"></th></tr></thead>
   <tbody className="divide-y divide-slate-100">{rows.map(d=><tr key={d.id} className="hover:bg-slate-50/70"><td className="px-5 py-4 text-slate-500">{date(d.createdAt)}</td><td className="px-5 py-4"><div className="font-medium text-slate-900">{d.title}</div><div className="text-xs text-slate-400">{d.contactName||"Без клиента"}</div></td><td className="px-5 py-4"><Badge variant="outline" style={{borderColor:d.stageColor||undefined}}>{d.stageName||"Без статуса"}</Badge></td><td className="px-5 py-4 text-right font-semibold">{money(d.value)}</td><td className="px-5 py-4 text-right"><Link href={`/deals/${d.id}`}><Button variant="ghost" size="sm">Открыть <ArrowRight className="ml-1 h-4 w-4"/></Button></Link></td></tr>)}</tbody></table></div>
   {!rows.length&&<div className="p-10 text-center text-sm text-slate-400">Сделок пока нет.</div>}
  </div>
 </div>
}
