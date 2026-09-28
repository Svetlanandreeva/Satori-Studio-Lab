import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deals, pipelineStages, dealEconomics } from "@/db/schema";
import { ArrowUpRight, Handshake } from "lucide-react";
import { reconcileDeals } from "@/lib/deal-reconcile";

export const dynamic="force-dynamic";
const money=(v:number)=>new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format((Number(v)||0)/100);
const date=(v:Date|number)=>new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",year:"numeric"}).format(v instanceof Date?v:new Date(v));

export default async function DealsPage(){
  await reconcileDeals();
  const rows=db.select({id:deals.id,title:deals.title,value:deals.value,createdAt:deals.createdAt,updatedAt:deals.updatedAt,contactName:contacts.name,contactSource:contacts.source,qualification:contacts.qualification,stageName:pipelineStages.name,stageColor:pipelineStages.color,isLost:pipelineStages.isLost,isWon:pipelineStages.isWon,notes:deals.notes,receivedAmount:dealEconomics.receivedAmount})
    .from(deals)
    .leftJoin(contacts,eq(deals.contactId,contacts.id))
    .leftJoin(pipelineStages,eq(deals.stageId,pipelineStages.id))
    .leftJoin(dealEconomics,eq(dealEconomics.dealId,deals.id))
    .orderBy(desc(deals.updatedAt)).all().filter(d=>{
      if(d.isLost) return false;
      if(d.contactSource==="need_number"||["spam","unqualified","ignore"].includes(String(d.qualification||"").toLowerCase())) return false;
      const hay=(String(d.title||"")+" "+String(d.contactName||"")+" "+String(d.notes||"")).toLowerCase();
      return !/elama|e-lama|ai-маркетолог|ticket#|mailer-daemon|no-reply|noreply/.test(hay);
    });

  const active=rows.filter(x=>!x.isWon).length;
  const won=rows.filter(x=>x.isWon).length;
  const total=rows.reduce((n,x)=>n+Number(x.value||0),0);
  const received=rows.reduce((n,x)=>n+Math.max(0,Number(x.receivedAmount||0)),0);

  return <div className="mx-auto max-w-[1500px] space-y-4 pb-10">
    <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="studio-label mb-1">Работа с заказами</div><h1 className="studio-title text-2xl font-semibold tracking-[-.04em]">Сделки</h1><p className="studio-muted mt-1 max-w-xl text-sm">Сумма сделки — сколько выставлено клиенту. «Получено» — только фактически внесённая оплата. Отказы из списка убраны и попадают в Песочницу.</p></div><div className="grid grid-cols-4 gap-2"><Mini label="Активные" value={String(active)}/><Mini label="Завершено" value={String(won)}/><Mini label="Сумма сделок" value={money(total)}/><Mini label="Получено" value={money(received)} accent/></div></section>

    <section className="studio-card overflow-hidden">
      <div className="grid grid-cols-[120px_minmax(240px,1fr)_165px_135px_135px_48px] border-b border-black/[.05] px-5 py-3 text-[9px] font-semibold uppercase tracking-[.14em] text-slate-400 dark:border-white/[.06] max-lg:hidden"><div>Дата</div><div>Сделка</div><div>Статус</div><div className="text-right">Выставлено</div><div className="text-right">Получено</div><div/></div>
      <div className="divide-y divide-black/[.05] dark:divide-white/[.06]">{rows.map(d=><Link key={d.id} href={`/deals/${d.id}`} className="group grid gap-3 px-5 py-4 transition hover:bg-black/[.018] dark:hover:bg-white/[.025] lg:grid-cols-[120px_minmax(240px,1fr)_165px_135px_135px_48px] lg:items-center"><div className="studio-muted text-xs">{date(d.createdAt)}</div><div className="min-w-0"><div className="studio-title truncate text-sm font-semibold">{d.title||"Без названия"}</div><div className="studio-muted mt-1 truncate text-xs">{d.contactName||"Без клиента"}</div></div><div><span className="inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold dark:border-white/[.08]" style={{borderColor:d.stageColor||undefined,color:d.stageColor||undefined}}>{d.stageName||"Без статуса"}</span></div><div className="studio-title text-sm font-semibold lg:text-right">{money(d.value)}</div><div className="text-sm font-semibold text-emerald-700 lg:text-right dark:text-emerald-400">{money(Number(d.receivedAmount||0))}</div><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/[.035] text-slate-400 transition group-hover:bg-[#17191f] group-hover:text-white dark:bg-white/[.05] dark:group-hover:bg-white dark:group-hover:text-[#17191f]"><ArrowUpRight className="h-4 w-4"/></div></Link>)}</div>
      {!rows.length&&<div className="p-14 text-center"><Handshake className="mx-auto h-7 w-7 text-slate-300"/><div className="studio-muted mt-3 text-sm">Активных сделок пока нет.</div></div>}
    </section>
  </div>
}

function Mini({label,value,accent=false}:{label:string;value:string;accent?:boolean}){return <div className={`studio-card-soft min-w-[105px] p-3 ${accent?"ring-1 ring-emerald-400/20":""}`}><div className="studio-label">{label}</div><div className="studio-title mt-2 truncate text-sm font-semibold">{value}</div></div>}
