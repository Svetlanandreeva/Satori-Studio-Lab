import Link from "next/link";
import { db } from "@/db";
import { contacts, deals, activities, pipelineStages, dealEconomics } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { PipelineChart } from "@/components/dashboard/PipelineChart";
import { SPAM_STAGE_NAME } from "@/lib/lead-qualification";
import { ArrowUpRight, CalendarDays, Handshake, MessageCircle, Users, WalletCards } from "lucide-react";
import { getDealPaymentDate } from "@/lib/deal-payment-meta";

export const dynamic = "force-dynamic";

function money(value:number){return new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format((Number(value)||0)/100)}
function greeting(){const h=Number(new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",hour:"2-digit",hour12:false}).format(new Date()));return h<12?"Доброе утро":h<18?"Добрый день":"Добрый вечер"}
function shortDate(value:Date|null){return value?new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"short"}).format(value):"—"}
function daysUntil(value:Date|null){if(!value)return null;const a=new Date();a.setHours(0,0,0,0);const b=new Date(value);b.setHours(0,0,0,0);return Math.ceil((b.getTime()-a.getTime())/86400000)}

export default function DashboardPage(){
  const visibleContacts=db.select().from(contacts).all().filter(c=>!["spam","ignore"].includes(String(c.qualification||"").toLowerCase()));
  const contactIds=new Set(visibleContacts.map(c=>c.id));
  const stages=db.select().from(pipelineStages).orderBy(asc(pipelineStages.order)).all().filter(s=>s.name!==SPAM_STAGE_NAME);
  const stageIds=new Set(stages.map(s=>s.id));
  const allDeals=db.select().from(deals).all().filter(d=>contactIds.has(d.contactId)&&stageIds.has(d.stageId));
  const activeDeals=allDeals.filter(d=>{const s=stages.find(x=>x.id===d.stageId);return s&&!s.isWon&&!s.isLost});
  const commercialDeals=allDeals.filter(d=>{const s=stages.find(x=>x.id===d.stageId);return s&&!s.isLost});
  const economics=db.select().from(dealEconomics).all();
  const econByDeal=new Map(economics.map(e=>[e.dealId,e]));

  const totalPipeline=activeDeals.reduce((sum,d)=>sum+Number(d.value||0),0);
  const totalReceived=commercialDeals.reduce((sum,d)=>sum+Math.max(0,Number(econByDeal.get(d.id)?.receivedAmount||0)),0);
  const unpaid=Math.max(0,activeDeals.reduce((sum,d)=>sum+Number(d.value||0),0)-activeDeals.reduce((sum,d)=>sum+Number(econByDeal.get(d.id)?.receivedAmount||0),0));
  const paidDeals=commercialDeals.filter(d=>Number(econByDeal.get(d.id)?.receivedAmount||0)>0).length;

  const deadlines=activeDeals
    .filter(d=>d.expectedClose)
    .map(d=>({deal:d,stage:stages.find(s=>s.id===d.stageId),client:visibleContacts.find(c=>c.id===d.contactId),days:daysUntil(d.expectedClose),paymentDate:getDealPaymentDate(d.id)}))
    .sort((a,b)=>(a.deal.expectedClose?.getTime()||0)-(b.deal.expectedClose?.getTime()||0))
    .slice(0,6);

  const pipelineData=stages.filter(s=>!s.isLost).map(stage=>({name:stage.name,count:allDeals.filter(d=>d.stageId===stage.id).length,value:allDeals.filter(d=>d.stageId===stage.id).reduce((n,d)=>n+d.value,0),color:stage.color}));
  const recent=db.select({id:activities.id,type:activities.type,description:activities.description,contactId:activities.contactId,dealId:activities.dealId,contactName:contacts.name,createdAt:activities.createdAt}).from(activities).leftJoin(contacts,eq(activities.contactId,contacts.id)).orderBy(desc(activities.createdAt)).all().filter(a=>contactIds.has(a.contactId)).slice(0,6);

  return <div className="mx-auto max-w-[1500px] space-y-4 pb-10">
    <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="studio-label mb-1">Satori Studio · CRM</div><h1 className="studio-title text-xl font-semibold tracking-[-.03em] sm:text-2xl">{greeting()}, <span className="studio-gradient-text">Светлана</span></h1></div>
      <div className="flex flex-wrap gap-2"><Quick href="/deals" icon={Handshake} label="Сделки"/><Quick href="/contacts" icon={Users} label="Клиенты"/><Quick href="/inbox" icon={MessageCircle} label="Сообщения"/></div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Активные сделки" value={money(totalPipeline)} detail={`${activeDeals.length} шт.`} icon={Handshake}/>
      <Metric label="Получено от клиентов" value={money(totalReceived)} detail={`${paidDeals} оплаченных заказов`} icon={WalletCards} accent/>
      <Metric label="Осталось получить" value={money(unpaid)} detail="по активным сделкам"/>
      <Metric label="Клиенты в работе" value={String(visibleContacts.length)} detail="без спама и отказных" icon={Users}/>
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
      <div className="studio-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-black/[.045] px-5 py-4 dark:border-white/[.055]"><div><h2 className="studio-title text-sm font-semibold">Календарь проектов</h2><p className="studio-muted mt-1 text-xs">Ближайшие дедлайны активных заказов</p></div><Link href="/projects" className="studio-muted inline-flex items-center gap-1 text-xs font-medium hover:text-violet-500">Все проекты <ArrowUpRight className="h-3.5 w-3.5"/></Link></div>
        <div className="divide-y divide-black/[.04] dark:divide-white/[.05]">{deadlines.map(({deal,stage,client,days,paymentDate})=><Link key={deal.id} href={`/deals/${deal.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-black/[.018] dark:hover:bg-white/[.025]"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/[.035] dark:bg-white/[.05]"><CalendarDays className="h-4 w-4"/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{deal.title}</div><div className="mt-0.5 truncate text-xs text-slate-400">{client?.name||"Клиент"} · {stage?.name||"—"}{paymentDate?` · оплата ${new Intl.DateTimeFormat("ru-RU").format(new Date(paymentDate+"T12:00:00"))}`:""}</div></div><div className="text-right"><div className="text-sm font-semibold">{shortDate(deal.expectedClose)}</div><div className={`mt-0.5 text-[11px] ${days!==null&&days<0?"text-rose-500":days!==null&&days<=3?"text-amber-500":"text-slate-400"}`}>{days===null?"":days<0?`просрочено ${Math.abs(days)} дн.`:days===0?"сегодня":`${days} дн.`}</div></div></Link>)}{!deadlines.length&&<div className="p-8 text-center text-sm text-slate-400">Пока нет проектов с дедлайном. Дату можно поставить прямо в карточке сделки.</div>}</div>
      </div>

      <div className="studio-card overflow-hidden"><div className="flex items-center justify-between border-b border-black/[.045] px-5 py-4 dark:border-white/[.055]"><div><h2 className="studio-title text-sm font-semibold">Последние изменения</h2><p className="studio-muted mt-1 text-xs">Нажми на запись, чтобы открыть клиента или сделку</p></div></div><div className="divide-y divide-black/[.04] dark:divide-white/[.05]">{recent.map(a=><Link key={a.id} href={a.dealId?`/deals/${a.dealId}`:`/contacts/${a.contactId}`} className="block px-5 py-3.5 transition hover:bg-black/[.018] dark:hover:bg-white/[.025]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-medium">{a.contactName||"Изменение"}</div><div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{a.description}</div></div><ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300"/></div></Link>)}{!recent.length&&<div className="p-8 text-center text-sm text-slate-400">Изменений пока нет.</div>}</div></div>
    </section>

    <section className="studio-card overflow-hidden"><div className="flex items-center justify-between border-b border-black/[.045] px-5 py-4 dark:border-white/[.055]"><div><h2 className="studio-title text-sm font-semibold">Воронка</h2><p className="studio-muted mt-1 text-xs">Сумма в карточке = выставленная / согласованная сумма сделки</p></div><Link href="/deals" className="studio-muted inline-flex items-center gap-1 text-xs font-medium hover:text-violet-500">Открыть <ArrowUpRight className="h-3.5 w-3.5"/></Link></div><div className="p-2 sm:p-3"><PipelineChart data={pipelineData}/></div></section>
  </div>
}

function Metric({label,value,detail,icon:Icon,accent=false}:{label:string;value:string;detail?:string;icon?:typeof Users;accent?:boolean}){return <div className={`studio-card relative overflow-hidden p-4 ${accent?"ring-1 ring-violet-400/15":""}`}>{accent&&<div className="studio-gradient absolute inset-x-0 top-0 h-0.5"/>}<div className="flex items-center justify-between"><div className="studio-label">{label}</div>{Icon&&<Icon className="h-4 w-4 text-slate-300 dark:text-slate-600"/>}</div><div className="studio-title mt-2 truncate text-xl font-semibold tracking-[-.035em]">{value}</div>{detail&&<div className="mt-1 text-[11px] text-slate-400">{detail}</div>}</div>}
function Quick({href,icon:Icon,label}:{href:string;icon:typeof Users;label:string}){return <Link href={href} className="inline-flex h-9 items-center gap-2 rounded-xl border border-black/[.055] bg-white px-3 text-xs font-semibold text-slate-700 transition hover:-translate-y-px dark:border-white/[.07] dark:bg-white/[.035] dark:text-slate-300"><Icon className="h-3.5 w-3.5"/>{label}</Link>}
