import { BarChart3, Percent, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import { db } from "@/db";
import { contacts, deals, pipelineStages, dealEconomics } from "@/db/schema";
import { SPAM_STAGE_NAME } from "@/lib/lead-qualification";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  website: "Сайт", order: "Сайт", need_number: "Need Number", email: "Почта", telegram: "Telegram-бот",
  telegram_account: "Telegram", instagram: "Instagram", linkedin: "LinkedIn", ads: "Реклама", referral: "Рекомендации", otro: "Другое", other: "Другое",
};
function money(value: number) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format((Number(value) || 0) / 100); }
function percent(value: number) { return `${(Number(value) || 0).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`; }

export default function AnalyticsPage() {
  const allContacts=db.select().from(contacts).all().filter(c=>!["spam","ignore"].includes(String(c.qualification||"").toLowerCase()));
  const contactMap=new Map(allContacts.map(c=>[c.id,c]));
  const stages=db.select().from(pipelineStages).all().filter(s=>s.name!==SPAM_STAGE_NAME);
  const stageMap=new Map(stages.map(s=>[s.id,s]));
  const allDeals=db.select().from(deals).all().filter(d=>contactMap.has(d.contactId)&&stageMap.has(d.stageId));
  const economics=db.select().from(dealEconomics).all();
  const econMap=new Map(economics.map(e=>[e.dealId,e]));
  const active=allDeals.filter(d=>{const s=stageMap.get(d.stageId);return s&&!s.isLost&&!s.isWon});
  const won=allDeals.filter(d=>stageMap.get(d.stageId)?.isWon);
  const paid=allDeals.filter(d=>Number(econMap.get(d.id)?.receivedAmount||0)>0);
  const revenue=paid.reduce((sum,d)=>sum+Number(econMap.get(d.id)?.receivedAmount||0),0);
  const profit=paid.reduce((sum,d)=>{const e=econMap.get(d.id);if(!e)return sum;const costs=Number(e.productionCost||0)+Number(e.paymentCommission||0)+Number(e.deliveryCost||0)+Number(e.packagingCost||0)+Number(e.contractorCost||0)+Number(e.taxCost||0)+Number(e.otherCost||0);return sum+Number(e.receivedAmount||0)-costs},0);
  const avgCheck=paid.length?revenue/paid.length:0;
  const conversion=allDeals.length?(won.length/allDeals.length)*100:0;

  const grouped=new Map<string,{source:string;contactIds:Set<string>;dealIds:Set<string>;paidDeals:Set<string>;revenue:number;profit:number}>();
  for(const c of allContacts){const source=String(c.source||"other");const b=grouped.get(source)||{source,contactIds:new Set(),dealIds:new Set(),paidDeals:new Set(),revenue:0,profit:0};b.contactIds.add(c.id);grouped.set(source,b)}
  for(const d of allDeals){const c=contactMap.get(d.contactId);const source=String(c?.source||"other");const b=grouped.get(source)||{source,contactIds:new Set(),dealIds:new Set(),paidDeals:new Set(),revenue:0,profit:0};b.dealIds.add(d.id);const e=econMap.get(d.id);if(Number(e?.receivedAmount||0)>0){b.paidDeals.add(d.id);b.revenue+=Number(e?.receivedAmount||0);const costs=Number(e?.productionCost||0)+Number(e?.paymentCommission||0)+Number(e?.deliveryCost||0)+Number(e?.packagingCost||0)+Number(e?.contractorCost||0)+Number(e?.taxCost||0)+Number(e?.otherCost||0);b.profit+=Number(e?.receivedAmount||0)-costs}grouped.set(source,b)}
  const sources=Array.from(grouped.values()).map(b=>({source:b.source,contacts:b.contactIds.size,deals:b.dealIds.size,paid:b.paidDeals.size,revenue:b.revenue,profit:b.profit})).filter(x=>x.contacts||x.deals).sort((a,b)=>b.contacts-a.contacts);

  return <div className="mx-auto max-w-[1480px] space-y-5 pb-10">
    <section><div className="mb-1 flex items-center gap-2 text-[11px] font-medium text-slate-400"><BarChart3 className="h-4 w-4"/>Живые данные CRM</div><h1 className="text-2xl font-semibold tracking-[-.035em]">Аналитика</h1><p className="mt-1 text-sm text-slate-400">Здесь считаются только реальные клиенты, реальные сделки и фактически внесённые оплаты.</p></section>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <Metric icon={Percent} label="Конверсия" value={percent(conversion)}/>
      <Metric icon={ReceiptText} label="Средняя оплата" value={money(avgCheck)}/>
      <Metric icon={WalletCards} label="Получено" value={money(revenue)}/>
      <Metric icon={TrendingUp} label="Прибыль по оплатам" value={money(profit)}/>
      <Metric icon={BarChart3} label="Активных сделок" value={String(active.length)}/>
    </div>
    <section className="overflow-hidden rounded-[22px] border border-black/[.055] bg-white dark:border-white/[.07] dark:bg-[#171a20]">
      <div className="border-b border-black/[.045] px-5 py-4 dark:border-white/[.055]"><h2 className="text-sm font-semibold">Источники</h2><p className="mt-1 text-xs text-slate-400">Один клиент считается один раз. Оплата и прибыль появляются только после внесения фактического платежа.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-black/[.018] text-[11px] font-medium text-slate-400 dark:bg-white/[.02]"><tr><th className="px-5 py-3">Источник</th><th className="px-4 py-3">Клиенты</th><th className="px-4 py-3">Сделки</th><th className="px-4 py-3">С оплатой</th><th className="px-4 py-3">Получено</th><th className="px-5 py-3">Прибыль</th></tr></thead><tbody className="divide-y divide-black/[.04] dark:divide-white/[.05]">{sources.map(item=><tr key={item.source}><td className="px-5 py-3 font-medium">{SOURCE_LABELS[item.source]||item.source}</td><td className="px-4 py-3 text-slate-500">{item.contacts}</td><td className="px-4 py-3 text-slate-500">{item.deals}</td><td className="px-4 py-3 text-slate-500">{item.paid}</td><td className="px-4 py-3 font-medium">{money(item.revenue)}</td><td className={`px-5 py-3 font-medium ${item.profit<0?"text-rose-500":"text-emerald-600"}`}>{money(item.profit)}</td></tr>)}</tbody></table>{!sources.length&&<div className="p-10 text-center text-sm text-slate-400">Пока недостаточно данных.</div>}</div>
    </section>
  </div>
}

function Metric({icon:Icon,label,value}:{icon:typeof Percent;label:string;value:string}){return <div className="rounded-[20px] border border-black/[.055] bg-white p-4 dark:border-white/[.07] dark:bg-[#171a20]"><div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Icon className="h-3.5 w-3.5"/>{label}</div><div className="mt-2 truncate text-xl font-semibold tracking-tight">{value}</div></div>}
