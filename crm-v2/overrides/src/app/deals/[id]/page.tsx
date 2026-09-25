import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, Boxes, Clock3, ExternalLink, UserRound, WalletCards } from "lucide-react";
import { db } from "@/db";
import { contacts, deals, pipelineStages, teamMembers } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DealOperationsPanel } from "@/components/deals/DealOperationsPanel";
import { DealManualEditor } from "@/components/deals/DealManualEditor";
import { DealConversation } from "@/components/deals/DealConversation";
import { getDealEconomics } from "@/lib/economics";
import { calculateDealFinancials } from "@/lib/deal-financials";
import { listDealHistory, listTeamMembers } from "@/lib/operations";
import { getDealProcurementSummary, listDealPurchases } from "@/lib/procurement";
import { listClientDocuments } from "@/lib/client-documents";
import { analyzeDealWithAi, dealAiNeedsRefresh, getDealAiSummary } from "@/lib/deal-ai";

export const dynamic = "force-dynamic";

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format((Number(value) || 0) / 100);
}
function signedMoney(value: number) {
  const amount = Number(value) || 0;
  return `${amount > 0 ? "+" : ""}${money(amount)}`;
}
function date(value: number | Date) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(value instanceof Date ? value : new Date(value));
}
function calendarDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Intl.DateTimeFormat("ru-RU").format(new Date(year, month - 1, day)) : value;
}
function purchaseStatus(status: string) {
  if (status === "ordered") return { label: "Заказано", className: "border-amber-200 bg-amber-50 text-amber-700" };
  if (status === "paid") return { label: "Оплачено", className: "border-blue-200 bg-blue-50 text-blue-700" };
  if (status === "received") return { label: "Получено", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  return { label: "Планируется", className: "border-slate-200 bg-slate-50 text-slate-600" };
}

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    if (process.env.CRM_REFRESH_AI_ON_VIEW === "true" && dealAiNeedsRefresh(id)) await analyzeDealWithAi(id, true);
  } catch (error) {
    console.error("Deal AI refresh failed", id, error);
  }

  const deal = db.select({
    id: deals.id, title: deals.title, value: deals.value, probability: deals.probability, notes: deals.notes,
    ownerId: deals.ownerId, lossReason: deals.lossReason, createdAt: deals.createdAt, updatedAt: deals.updatedAt,
    contactId: contacts.id, contactName: contacts.name, company: contacts.company,
    stageId: deals.stageId, stageName: pipelineStages.name, stageColor: pipelineStages.color, isWon: pipelineStages.isWon, isLost: pipelineStages.isLost,
    ownerName: teamMembers.name,
  }).from(deals)
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .leftJoin(teamMembers, eq(deals.ownerId, teamMembers.id))
    .where(eq(deals.id, id)).get();
  if (!deal) notFound();

  const stageOptions = db.select({ id: pipelineStages.id, name: pipelineStages.name, isLost: pipelineStages.isLost }).from(pipelineStages).orderBy(pipelineStages.order).all();
  const economics = calculateDealFinancials({ ...(getDealEconomics(id) || {}), dealId: id, dealValue: deal.value });
  const procurement = listDealPurchases(id);
  const procurementSummary = getDealProcurementSummary(id);
  const history = listDealHistory(id) as Array<any>;
  const members = listTeamMembers() as Array<any>;
  const documents = deal.contactId ? listClientDocuments(deal.contactId) : [];
  const ai = getDealAiSummary(deal.id);
  const economicsRaw = (getDealEconomics(deal.id) || { receivedAmount: 0 }) as { receivedAmount: number };

  return (
    <div className="mx-auto max-w-[1280px] space-y-5 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/deals"><Button variant="ghost" size="icon" className="rounded-xl" aria-label="Назад к сделкам"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950">{deal.title}</h1>
            <Badge variant="outline" style={{ borderColor: deal.stageColor || undefined }}>{deal.stageName || "Без этапа"}</Badge>
            {deal.isLost && <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Отказ</Badge>}
            {deal.isWon && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Завершено</Badge>}
          </div>
          <div className="mt-1 text-sm text-slate-500">{deal.contactName || "Без клиента"}{deal.company ? ` · ${deal.company}` : ""}</div>
        </div>
      </div>

      <DealManualEditor dealId={deal.id} value={deal.value} stageId={deal.stageId} stages={stageOptions} lossReason={deal.lossReason}/>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        <Metric label="Сумма сделки" value={money(deal.value)} />
        <Metric label="Получено" value={money(economics.receivedAmount)} />
        <Metric label="Закупки · план" value={money(procurementSummary.plannedTotal)} />
        <Metric label="Закупки · факт" value={money(procurementSummary.actualTotal)} />
        <Metric label="Перерасход" value={signedMoney(procurementSummary.variance)} tone={procurementSummary.variance > 0 ? "text-rose-600" : procurementSummary.variance < 0 ? "text-emerald-700" : undefined} />
        <Metric label="Прибыль компании" value={money(economics.profit)} />
        <Metric label="Маржа" value={economics.receivedAmount ? `${economics.margin.toFixed(1)}%` : "—"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,.82fr)_minmax(420px,1.18fr)]">
        <div className="space-y-4">
          <Card className="rounded-[24px] border-slate-200/80 shadow-sm">
            <CardHeader><CardTitle className="text-base">Заказ и оплата</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Info label="Название" value={deal.title}/>
              <Info label="Статус" value={deal.stageName || "—"}/>
              <Info label="Сумма" value={money(deal.value)}/>
              <Info label="Получено оплат" value={money(economicsRaw.receivedAmount)}/>
              <Info label="Предоплата" value={deal.value ? `${Math.min(100, Math.round(economicsRaw.receivedAmount / deal.value * 100))}%` : "—"}/>
              <Info label="Дата сделки" value={date(deal.createdAt)}/>
              <Info label="Клиент" value={deal.contactName || "—"}/>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-slate-200/80 shadow-sm">
            <CardHeader><CardTitle className="text-base">Файлы и КП</CardTitle></CardHeader>
            <CardContent>
              {!documents.length ? <div className="text-sm text-slate-400">Файлов пока нет.</div> : <div className="space-y-2">{documents.slice(0, 8).map((d: any) => <a key={d.id} href={`/api/contacts/${deal.contactId}/documents/${d.id}`} target="_blank" className="block rounded-xl border bg-slate-50 px-3 py-2 text-sm hover:bg-white"><div className="font-medium text-slate-800">{d.name}</div><div className="text-[11px] text-slate-400">{d.kind}</div></a>)}</div>}
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-slate-200/80 shadow-sm">
            <CardHeader><CardTitle className="text-base">Описание от AI</CardTitle></CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{ai?.summary || "AI ещё не сформировал краткий срез именно по этой сделке."}</div>
              {ai?.updatedAt && <div className="mt-3 text-[11px] text-slate-400">Обновлено: {date(Number(ai.updatedAt))}</div>}
            </CardContent>
          </Card>
        </div>
        {deal.contactId ? <DealConversation contactId={deal.contactId} threadId={ai?.sourceThreadId || null}/> : <div className="rounded-[24px] border bg-white p-8 text-sm text-slate-400">К сделке не привязан клиент.</div>}
      </div>

      <Card className="rounded-[24px] border-slate-200/80 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserRound className="h-4 w-4" />Ответственный и результат</CardTitle></CardHeader>
        <CardContent><DealOperationsPanel dealId={deal.id} ownerId={deal.ownerId || null} lossReason={deal.lossReason || null} members={members} /></CardContent>
      </Card>

      <Card className="rounded-[24px] border-slate-200/80 shadow-sm">
        <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><Boxes className="h-4 w-4" />Закупки и материалы</CardTitle><p className="mt-1 text-xs text-slate-400">Факт автоматически входит в прямые расходы и влияет на прибыль и маржу. План нужен для контроля бюджета.</p></div><Link href="/procurement"><Button variant="outline" size="sm">Управлять закупками</Button></Link></div></CardHeader>
        <CardContent>
          {!procurement.length ? <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Материалы пока не занесены. Добавь их в разделе «Закупки», чтобы себестоимость сделки считалась точно.</div> : <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-sm"><thead className="text-left text-[11px] uppercase tracking-wide text-slate-400"><tr><th className="pb-2">Материал</th><th className="pb-2">Статус</th><th className="pb-2">Количество</th><th className="pb-2 text-right">План</th><th className="pb-2 text-right">Факт</th><th className="pb-2 text-right">Отклонение</th><th className="pb-2">Поставщик / дата</th></tr></thead><tbody className="divide-y divide-slate-100">{procurement.map((item) => { const meta = purchaseStatus(item.status); return <tr key={item.id}><td className="py-3 pr-3"><div className="font-medium text-slate-800">{item.name}</div>{item.notes && <div className="mt-0.5 max-w-[260px] truncate text-xs text-slate-400">{item.notes}</div>}{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"><ExternalLink className="h-3 w-3" />Товар / чек</a>}</td><td className="py-3 pr-3"><Badge variant="outline" className={meta.className}>{meta.label}</Badge></td><td className="py-3 pr-3 text-slate-500">{item.quantity} {item.unit}</td><td className="py-3 pr-3 text-right text-slate-500">{money(item.plannedTotalCost)}</td><td className="py-3 pr-3 text-right font-semibold text-slate-900">{money(item.totalCost)}</td><td className={`py-3 pr-3 text-right font-medium ${item.variance > 0 ? "text-rose-600" : item.variance < 0 ? "text-emerald-700" : "text-slate-500"}`}>{signedMoney(item.variance)}</td><td className="py-3 text-slate-500"><div>{item.supplier || "—"}</div><div className="mt-0.5 text-xs text-slate-400">{calendarDate(item.purchaseDate)}</div></td></tr>; })}</tbody><tfoot><tr className="border-t"><td colSpan={3} className="pt-4 text-sm font-medium text-slate-500">Закупки итого</td><td className="pt-4 text-right font-semibold text-slate-700">{money(procurementSummary.plannedTotal)}</td><td className="pt-4 text-right text-base font-semibold text-slate-950">{money(procurementSummary.actualTotal)}</td><td className={`pt-4 text-right font-semibold ${procurementSummary.variance > 0 ? "text-rose-600" : procurementSummary.variance < 0 ? "text-emerald-700" : "text-slate-500"}`}>{signedMoney(procurementSummary.variance)}</td><td /></tr></tfoot></table></div>}
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-slate-200/80 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4" />История движения по воронке</CardTitle></CardHeader>
        <CardContent>
          {!history.length ? <p className="text-sm text-slate-500">История пока пуста.</p> : (
            <div className="space-y-0">
              {history.map((item, index) => (
                <div key={item.id} className="relative flex gap-4 pb-5 last:pb-0">
                  {index < history.length - 1 && <div className="absolute left-[7px] top-4 h-[calc(100%-4px)] w-px bg-slate-200" />}
                  <div className="relative mt-1.5 h-4 w-4 shrink-0 rounded-full border-4 border-white bg-slate-900 shadow-sm ring-1 ring-slate-200" />
                  <div className="min-w-0 flex-1 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-slate-900">{item.fromStage ? `${item.fromStage} → ` : ""}{item.toStage || "Этап"}</div>
                      <div className="text-[11px] text-slate-400">{date(item.createdAt)}</div>
                    </div>
                    {item.reason && <div className="mt-1 text-xs text-slate-600">{item.reason}</div>}
                    <div className="mt-1 text-[11px] text-slate-400">{item.changedByName ? `Изменил: ${item.changedByName}` : "Системное изменение"}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 last:border-0"><span className="text-slate-400">{label}</span><span className="text-right font-medium text-slate-800">{value}</span></div>;
}

function Metric({ label, value, tone = "text-slate-950" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-[11px] text-slate-400"><WalletCards className="h-3.5 w-3.5" />{label}</div><div className={`mt-2 text-xl font-semibold tracking-tight ${tone}`}>{value}</div></div>;
}
