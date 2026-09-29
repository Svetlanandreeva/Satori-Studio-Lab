import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, Boxes, Clock3 } from "lucide-react";
import { db } from "@/db";
import { contacts, deals, pipelineStages, teamMembers } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DealStageBar } from "@/components/deals/DealStageBar";
import { DealMoneyDates } from "@/components/deals/DealMoneyDates";
import { getDealSchedule } from "@/lib/deal-schedule";
import { DealConversation } from "@/components/deals/DealConversation";
import { DealHeaderActions } from "@/components/deals/DealActions";
import { getDealEconomics } from "@/lib/economics";
import { calculateDealFinancials } from "@/lib/deal-financials";
import { listDealHistory, listTeamMembers } from "@/lib/operations";
import { getDealProcurementSummary, listDealPurchases } from "@/lib/procurement";
import { listClientDocuments } from "@/lib/client-documents";
import { DealFiles } from "@/components/deals/DealFiles";
import { analyzeDealWithAi, dealAiNeedsRefresh, getDealAiSummary } from "@/lib/deal-ai";

export const dynamic = "force-dynamic";

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format((Number(value) || 0) / 100);
}
function date(value: number | Date) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(value instanceof Date ? value : new Date(value));
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

  const economics = calculateDealFinancials({ ...(getDealEconomics(id) || {}), dealId: id, dealValue: deal.value });
  const procurement = listDealPurchases(id);
  const procurementSummary = getDealProcurementSummary(id);
  const history = listDealHistory(id) as Array<any>;
  const members = listTeamMembers() as Array<any>;
  const documents = deal.contactId ? listClientDocuments(deal.contactId) : [];
  const ai = getDealAiSummary(deal.id);
  const economicsRaw = (getDealEconomics(deal.id) || { receivedAmount: 0 }) as { receivedAmount: number };

  const stageList = db.select().from(pipelineStages).orderBy(pipelineStages.order).all()
    .filter((st) => !/песочниц|спам/i.test(st.name))
    .map((st) => ({ id: st.id, name: st.name, color: st.color, isWon: Boolean(st.isWon), isLost: Boolean(st.isLost) }));
  const schedule = getDealSchedule(deal.id);
  const siblingOpen = deal.contactId ? db.select({ id: deals.id, isWon: pipelineStages.isWon, isLost: pipelineStages.isLost }).from(deals)
    .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id)).where(eq(deals.contactId, deal.contactId)).all()
    .filter((d) => d.id !== deal.id && !d.isWon && !d.isLost).length : 0;

  return (
    <div className="mx-auto max-w-[1320px] space-y-4 pb-10">
      <div className="flex flex-wrap items-start gap-3">
        <Link href="/deals"><Button variant="ghost" size="icon" className="mt-0.5 rounded-xl" aria-label="Назад к сделкам"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{deal.title}</h1>
          <div className="mt-1 text-sm text-slate-500">
            {deal.contactId ? <Link href={`/contacts/${deal.contactId}`} className="font-medium text-slate-700 hover:underline dark:text-slate-300">{deal.contactName || "Клиент"}</Link> : "Без клиента"}
            {deal.company ? ` · ${deal.company}` : ""} · создана {date(deal.createdAt)}
          </div>
        </div>
        <DealHeaderActions deal={{ id: deal.id, title: deal.title, value: deal.value, stageId: deal.stageId, contactId: deal.contactId, contactName: deal.contactName, notes: deal.notes }} />
      </div>

      <DealStageBar dealId={deal.id} stageId={deal.stageId} stages={stageList} />
      {siblingOpen > 0 && !deal.isWon && !deal.isLost && (
        <Link href={`/deals?q=${encodeURIComponent(deal.contactName || "")}`} className="block rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 hover:bg-amber-100">
          У этого клиента ещё {siblingOpen} открыт{siblingOpen === 1 ? "ая сделка" : "ых сделки"}. Если это один заказ — отметь их в «Сделках» и нажми «Объединить в одну» →
        </Link>
      )}
      {deal.isLost && deal.lossReason && <div className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">Причина отказа: {deal.lossReason}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,1fr)]">
        <div className="space-y-4">
          <DealMoneyDates
            dealId={deal.id}
            value={deal.value}
            received={economicsRaw.receivedAmount}
            schedule={{ paidAt: schedule.paidAt, termDays: schedule.termDays, deadline: schedule.deadline, shippedAt: schedule.shippedAt }}
            ownerId={deal.ownerId || null}
            members={members}
            costs={{ procurement: procurementSummary.actualTotal, profit: economics.profit }}
          />

          {procurement.length > 0 && (
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
              <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold"><Boxes className="h-4 w-4 text-slate-400" />Закупки</h2><Link href="/procurement" className="text-xs text-slate-500 hover:text-slate-900">Управлять →</Link></div>
              <div className="divide-y divide-slate-100 text-sm dark:divide-white/[.06]">
                {procurement.map((item) => { const meta = purchaseStatus(item.status); return (
                  <div key={item.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200">{item.name} <span className="text-slate-400">· {item.quantity} {item.unit}</span></div>
                    <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                    <div className="w-24 text-right font-medium tabular-nums">{money(item.totalCost || item.plannedTotalCost)}</div>
                  </div>); })}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
            <DealFiles contactId={deal.contactId || ""} dealId={deal.id} documents={documents.map((d: any) => ({ id: d.id, name: d.name, mimeType: d.mimeType, sizeBytes: d.sizeBytes }))} />
          </section>

          <details className="group rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-semibold"><Clock3 className="h-4 w-4 text-slate-400" />История этапов <span className="font-normal text-slate-400">{history.length}</span><span className="ml-auto text-xs font-normal text-slate-400 group-open:hidden">показать</span></summary>
            <div className="space-y-2 px-5 pb-4">
              {!history.length ? <p className="text-sm text-slate-500">История пока пуста.</p> : history.map((item) => (
                <div key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-slate-100 pt-2 text-[13px] dark:border-white/[.06]">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{item.fromStage ? `${item.fromStage} → ` : ""}{item.toStage || "Этап"}</span>
                  <span className="text-slate-400">{date(item.createdAt)}{item.changedByName ? ` · ${item.changedByName}` : ""}</span>
                  {item.reason && <span className="w-full text-slate-500">{item.reason}</span>}
                </div>
              ))}
            </div>
          </details>

          {ai?.summary && (
            <details className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
              <summary className="cursor-pointer list-none px-5 py-3.5 text-sm font-semibold">Краткое описание от AI</summary>
              <div className="whitespace-pre-wrap px-5 pb-4 text-sm leading-6 text-slate-600">{ai.summary}</div>
            </details>
          )}
        </div>

        <div>{deal.contactId ? <DealConversation contactId={deal.contactId} threadId={ai?.sourceThreadId || null}/> : <div className="rounded-2xl border bg-white p-8 text-sm text-slate-400">К сделке не привязан клиент.</div>}</div>
      </div>
    </div>
  );
}
