import Link from "next/link";
import { db } from "@/db";
import { contacts, deals, activities, pipelineStages, dealEconomics } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { PipelineChart } from "@/components/dashboard/PipelineChart";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { SPAM_STAGE_NAME } from "@/lib/lead-qualification";
import { ArrowUpRight, CalendarClock, Handshake, Mail, MessageCircle, Send, Users } from "lucide-react";

export const dynamic = "force-dynamic";

function money(value:number){return new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format((Number(value)||0)/100)}
function greeting(){const h=Number(new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",hour:"2-digit",hour12:false}).format(new Date()));return h<12?"Доброе утро":h<18?"Добрый день":"Добрый вечер"}

export default function DashboardPage({searchParams}:{searchParams?:{period?:string}}){
  const visibleContacts=db.select().from(contacts).all().filter(c=>!["spam","ignore"].includes(String(c.qualification||"").toLowerCase()));
  const contactIds=new Set(visibleContacts.map(c=>c.id));
  const stages=db.select().from(pipelineStages).orderBy(asc(pipelineStages.order)).all().filter(s=>s.name!==SPAM_STAGE_NAME);
  const stageIds=new Set(stages.map(s=>s.id));
  const allDeals=db.select().from(deals).all().filter(d=>contactIds.has(d.contactId)&&stageIds.has(d.stageId));
  const econ=db.select().from(dealEconomics).all();
  const econByDeal=new Map(econ.map(e=>[e.dealId,e]));

  const now=new Date();
  const todayStart=new Date(now);todayStart.setHours(0,0,0,0);
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const period=searchParams?.period==="month"?"month":"today";
  const from=period==="month"?monthStart:todayStart;
  const recentActs=db.select().from(activities).all().filter(a=>a.createdAt.getTime()>=from.getTime()&&contactIds.has(a.contactId));
  const uniqueContacts=new Set(recentActs.filter(a=>/email|telegram|call|звон|message|сообщ/i.test(String(a.type))).map(a=>a.contactId)).size;
  const emailCount=recentActs.filter(a=>/email/i.test(String(a.type))).length;
  const telegramCount=recentActs.filter(a=>/telegram/i.test(String(a.type))).length;
  const sentOffers=recentActs.filter(a=>/кп|коммерческ/i.test(String(a.description||""))&&/отправ/i.test(String(a.description||""))).length;
  const periodDeals=allDeals.filter(d=>d.updatedAt.getTime()>=from.getTime());
  const received=periodDeals.reduce((sum,d)=>sum+(econByDeal.get(d.id)?.receivedAmount||0),0);
  const earned=periodDeals.reduce((sum,d)=>{const e=econByDeal.get(d.id);return e?sum+Math.max(0,e.receivedAmount-e.productionCost-e.paymentCommission-e.deliveryCost-e.packagingCost-e.contractorCost-e.taxCost-e.otherCost):sum},0);
  const activeDeals=allDeals.filter(d=>{const s=stages.find(x=>x.id===d.stageId);return s&&!s.isWon&&!s.isLost}).length;

  const pipelineData=stages.filter(s=>!s.isLost).map(stage=>({name:stage.name,count:allDeals.filter(d=>d.stageId===stage.id).length,value:allDeals.filter(d=>d.stageId===stage.id).reduce((n,d)=>n+d.value,0),color:stage.color}));
  const recent=db.select({id:activities.id,type:activities.type,description:activities.description,contactId:activities.contactId,contactName:contacts.name,createdAt:activities.createdAt}).from(activities).leftJoin(contacts,eq(activities.contactId,contacts.id)).orderBy(desc(activities.createdAt)).all().filter(a=>contactIds.has(a.contactId)).slice(0,7);

  return <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
    <section className="studio-card overflow-hidden p-6 sm:p-7">
      <div className="grid gap-6 xl:grid-cols-[1fr_auto] xl:items-end">
        <div><div className="studio-label mb-3">Satori Studio · CRM</div><h1 className="studio-title text-3xl font-semibold tracking-[-.04em] sm:text-[42px]">{greeting()}, <span className="studio-gradient-text">Светлана</span></h1><p className="studio-muted mt-3 max-w-2xl text-sm leading-6">Живые данные из CRM: сделки, клиенты, почта, Telegram, задачи и деньги — без тестовых карточек.</p></div>
        <div className="flex flex-wrap gap-2"><Quick href="/deals" icon={Handshake} label="Сделки"/><Quick href="/contacts" icon={Users} label="Клиенты"/><Quick href="/inbox" icon={MessageCircle} label="Сообщения" accent/><Quick href="/tasks" icon={CalendarClock} label="Задачи"/></div>
      </div>
    </section>

    <div className="flex items-center justify-between gap-3"><div className="studio-label">Срез</div><div className="flex rounded-xl border border-black/[.05] bg-white p-1 dark:border-white/[.07] dark:bg-[#171a20]"><Link href="/" className={`rounded-lg px-3 py-1.5 text-xs font-medium ${period==="today"?"bg-[#17191f] text-white dark:bg-white dark:text-[#17191f]":"text-slate-500 dark:text-slate-400"}`}>Сегодня</Link><Link href="/?period=month" className={`rounded-lg px-3 py-1.5 text-xs font-medium ${period==="month"?"bg-[#17191f] text-white dark:bg-white dark:text-[#17191f]":"text-slate-500 dark:text-slate-400"}`}>Месяц</Link></div></div>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Metric label="Контактов" value={String(uniqueContacts)} icon={Users}/>
      <Metric label="Активных сделок" value={String(activeDeals)} icon={Handshake}/>
      <Metric label="Отправлено КП" value={String(sentOffers)} icon={Send}/>
      <Metric label="Почта / Telegram" value={`${emailCount} / ${telegramCount}`} icon={Mail}/>
      <Metric label="Получено оплат" value={money(received)} strong/>
      <Metric label="Заработано" value={money(earned)} strong accent/>
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
      <div className="studio-card overflow-hidden"><div className="flex items-center justify-between border-b border-black/[.05] px-5 py-4 dark:border-white/[.06]"><div><h2 className="studio-title text-sm font-semibold">Сделки по этапам</h2><p className="studio-muted mt-1 text-xs">Текущая воронка на живых данных</p></div><Link href="/deals" className="studio-muted inline-flex items-center gap-1 text-xs font-medium hover:text-violet-500">Открыть <ArrowUpRight className="h-3.5 w-3.5"/></Link></div><div className="p-2 sm:p-3"><PipelineChart data={pipelineData}/></div></div>
      <div className="studio-card overflow-hidden"><div className="border-b border-black/[.05] px-5 py-4 dark:border-white/[.06]"><h2 className="studio-title text-sm font-semibold">Последние изменения</h2><p className="studio-muted mt-1 text-xs">Письма, Telegram и действия в CRM</p></div><RecentActivity activities={recent as Array<{id:string;type:string;description:string;contactName:string|null;createdAt:number|Date}>}/></div>
    </section>
  </div>
}

function Metric({label,value,icon:Icon,strong=false,accent=false}:{label:string;value:string;icon?:typeof Users;strong?:boolean;accent?:boolean}){return <div className={`studio-card relative overflow-hidden p-4 ${accent?"ring-1 ring-violet-400/15":""}`}>{accent&&<div className="studio-gradient absolute inset-x-0 top-0 h-0.5"/>}<div className="flex items-center justify-between"><div className="studio-label">{label}</div>{Icon&&<Icon className="h-4 w-4 text-slate-300 dark:text-slate-600"/>}</div><div className={`studio-title mt-3 truncate font-semibold tracking-[-.035em] ${strong?"text-xl":"text-2xl"}`}>{value}</div></div>}
function Quick({href,icon:Icon,label,accent=false}:{href:string;icon:typeof Users;label:string;accent?:boolean}){return <Link href={href} className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-xs font-semibold transition hover:-translate-y-px ${accent?"studio-gradient text-white shadow-[0_10px_25px_rgba(130,95,255,.18)]":"border border-black/[.06] bg-[#f7f7f9] text-slate-700 dark:border-white/[.08] dark:bg-white/[.04] dark:text-slate-300"}`}><Icon className="h-4 w-4"/>{label}</Link>}
