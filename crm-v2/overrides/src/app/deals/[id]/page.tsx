import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, Boxes, Clock3, UserRound, WalletCards } from "lucide-react";
import { db } from "@/db";
import { contacts, deals, pipelineStages, teamMembers } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DealOperationsPanel } from "@/components/deals/DealOperationsPanel";
import { getDealEconomics } from "@/lib/economics";
import { calculateDealFinancials } from "@/lib/deal-financials";
import { listDealHistory, listTeamMembers } from "@/lib/operations";
import { getDealProcurementTotal, listDealPurchases } from "@/lib/procurement";

export const dynamic = "force-dynamic";

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format((Number(value) || 0) / 100);
}
function date(value: number | Date) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(value instanceof Date ? value : new Date(value));
}

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = db.select({
    id: deals.id, title: deals.title, value: deals.value, probability: deals.probability, notes: deals.notes,
    ownerId: deals.ownerId, lossReason: deals.lossReason, createdAt: deals.createdAt, updatedAt: deals.updatedAt,
    contactId: contacts.id, contactName: contacts.name, company: contacts.company,
    stageName: pipelineStages.name, stageColor: pipelineStages.color, isWon: pipelineStages.isWon, isLost: pipelineStages.isLost,
    ownerName: teamMembers.name,
  }).from(deals)
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .leftJoin(teamMembers, eq(deals.ownerId, teamMembers.id))
    .where(eq(deals.id, id)).get();
  if (!deal) notFound();

  const economics = calculateDealFinancials({ ...(getDealEconomics(id) || {}), dealId: id, dealValue: deal.value });
  const procurement = listDealPurchases(id);
  const procurementTotal = getDealProcurementTotal(id);
  const history = listDealHistory(id) as Array<any>;
  const members = listTeamMembers() as Array<any>;

  return (
    <div className="mx-auto max-w-[1180px] space-y-5 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={deal.contactId ? `/contacts/${deal.contactId}` : "/pipeline"}><Button variant="ghost" size="icon" className="rounded-xl"><ArrowLeft className="h-5 w-5" /></Button></Link>
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Сумма сделки" value={money(deal.value)} />
        <Metric label="Получено" value={money(economics.receivedAmount)} />
        <Metric label="Закупки" value={money(procurementTotal)} />
        <Metric label="Прибыль компании" value={money(economics.profit)} />
        <Metric label="Маржа" value={economics.receivedAmount ? `${economics.margin.toFixed(1)}%` : "—"} />
      </div>

      <Card className="rounded-[24px] border-slate-200/80 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserRound className="h-4 w-4" />Ответственный и результат</CardTitle></CardHeader>
        <CardContent><DealOperationsPanel dealId={deal.id} ownerId={deal.ownerId || null} lossReason={deal.lossReason || null} members={members} /></CardContent>
      </Card>

      <Card className="rounded-[24px] border-slate-200/80 shadow-sm">
        <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><Boxes className="h-4 w-4" />Закупки и материалы</CardTitle><p className="mt-1 text-xs text-slate-400">Эти позиции уже входят в прямые расходы и влияют на комиссию менеджера и прибыль компании.</p></div><Link href="/procurement"><Button variant="outline" size="sm">Управлять закупками</Button></Link></div></CardHeader>
        <CardContent>
          {!procurement.length ? <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Материалы пока не занесены. Добавь их в разделе «Закупки», чтобы себестоимость сделки считалась точно.</div> : <div className="overflow-x-auto"><table className="min-w-[680px] w-full text-sm"><thead className="text-left text-[11px] uppercase tracking-wide text-slate-400"><tr><th className="pb-2">Материал</th><th className="pb-2">Количество</th><th className="pb-2">Цена</th><th className="pb-2">Поставщик</th><th className="pb-2 text-right">Итого</th></tr></thead><tbody className="divide-y divide-slate-100">{procurement.map((item) => <tr key={item.id}><td className="py-3 pr-3"><div className="font-medium text-slate-800">{item.name}</div>{item.notes && <div className="mt-0.5 text-xs text-slate-400">{item.notes}</div>}</td><td className="py-3 pr-3 text-slate-500">{item.quantity} {item.unit}</td><td className="py-3 pr-3 text-slate-500">{money(item.unitCost)}</td><td className="py-3 pr-3 text-slate-500">{item.supplier || "—"}</td><td className="py-3 text-right font-semibold text-slate-900">{money(item.totalCost)}</td></tr>)}</tbody><tfoot><tr><td colSpan={4} className="pt-4 text-sm font-medium text-slate-500">Закупки итого</td><td className="pt-4 text-right text-base font-semibold text-slate-950">{money(procurementTotal)}</td></tr></tfoot></table></div>}
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

      {deal.notes && <Card className="rounded-[24px] border-slate-200/80 shadow-sm"><CardHeader><CardTitle className="text-base">Заметки</CardTitle></CardHeader><CardContent><div className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{deal.notes}</div></CardContent></Card>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-[11px] text-slate-400"><WalletCards className="h-3.5 w-3.5" />{label}</div><div className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{value}</div></div>;
}
