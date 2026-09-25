import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deals, pipelineStages } from "@/db/schema";
import { ArrowUpRight, Handshake } from "lucide-react";
import { reconcileDeals } from "@/lib/deal-reconcile";

export const dynamic="force-dynamic";
const money=(v:number)=>new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format((Number(v)||0)/100);
const date=(v:Date|number)=>new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",year:"numeric"}).format(v instanceof Date?v:new Date(v));

export default async function DealsPage(){
  await reconcileDeals();
  const rows=db.select({id:deals.id,title:deals.title,value:deals.value,createdAt:deals.createdAt,updatedAt:deals.updatedAt,contactName:contacts.name,contactSource:contacts.source,qualification:contacts.qualification,stageName:pipelineStages.name,stageColor:pipelineStages.color,isLost:pipelineStages.isLost,isWon:pipelineStages.isWon,notes:deals.notes})
    .from(deals).leftJoin(contacts,eq(deals.contactId,contacts.id)).leftJoin(pipelineStages,eq(deals.stageId,pipelineStages.id)).orderBy(desc(deals.updatedAt)).all().filter(d=>{
      if(d.contactSource==="need_number"||["spam","unqualified","ignore"].includes(String(d.qualification||"").toLowerCase())) return false;
      const hay=(String(d.title||"")+" "+String(d.contactName||"")+" "+String(d.notes||"")).toLowerCase();
      return !/elama|e-lama|ai-маркетолог|ticket#|mailer-daemon|no-reply|noreply/.test(hay);
    });

  const active=rows.filter(x=>!x.isLost&&!x.isWon).length;
  const won=rows.filter(x=>x.isWon).length;
  const total=rows.reduce((n,x)=>n+x.value,0);

  return <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
    <section className="studio-card p-6 sm:p-7"><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="studio-label mb-3">Работа с заказами</div><h1 className="studio-title text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Сделки</h1><p className="studio-muted mt-2 max-w-xl text-sm leading-6">Только реальные заявки. Статус, оговоренная сумма и полученная оплата управляются вручную в карточке сделки.</p></div><div className="grid grid-cols-3 gap-2"><Mini label="Активные" value={String(active)}/><Mini label="Завершено" value={String(won)}/><Mini label="Сумма" value={money(total)}/></div></div></section>

    <section className="studio-card overflow-hidden">
      <div className="grid grid-cols-[130px_minmax(260px,1fr)_170px_150px_52px] border-b border-black/[.05] px-5 py-3 text-[9px] font-semibold uppercase tracking-[.16em] text-slate-400 dark:border-white/[.06] dark:text-slate-500 max-lg:hidden"><div>Дата</div><div>Сделка</div><div>Статус</div><div className="text-right">Сумма</div><div/></div>
      <div className="divide-y divide-black/[.05] dark:divide-white/[.06]">{rows.map(d=><Link key={d.id} href={`/deals/${d.id}`} className="group grid gap-3 px-5 py-4 transition hover:bg-black/[.018] dark:hover:bg-white/[.025] lg:grid-cols-[130px_minmax(260px,1fr)_170px_150px_52px] lg:items-center"><div className="studio-muted text-xs">{date(d.createdAt)}</div><div className="min-w-0"><div className="studio-title truncate text-sm font-semibold">{d.title||"Без названия"}</div><div className="studio-muted mt-1 truncate text-xs">{d.contactName||"Без клиента"}</div></div><div><span className="inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold dark:border-white/[.08]" style={{borderColor:d.stageColor||undefined,color:d.stageColor||undefined}}>{d.stageName||"Без статуса"}</span></div><div className="studio-title text-sm font-semibold lg:text-right">{money(d.value)}</div><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/[.035] text-slate-400 transition group-hover:bg-[#17191f] group-hover:text-white dark:bg-white/[.05] dark:group-hover:bg-white dark:group-hover:text-[#17191f]"><ArrowUpRight className="h-4 w-4"/></div></Link>)}</div>
      {!rows.length&&<div className="p-14 text-center"><Handshake className="mx-auto h-7 w-7 text-slate-300"/><div className="studio-muted mt-3 text-sm">Сделок пока нет.</div></div>}
    </section>
  </div>
}

function Mini({label,value}:{label:string;value:string}){return <div className="studio-card-soft min-w-[96px] p-3"><div className="studio-label">{label}</div><div className="studio-title mt-2 truncate text-sm font-semibold">{value}</div></div>}
