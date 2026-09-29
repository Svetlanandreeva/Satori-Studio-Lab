import { db } from "@/db";
import { pipelineStages, deals, contacts, teamMembers } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { NewDealButton } from "@/components/deals/DealActions";
import { getDealSchedules } from "@/lib/deal-schedule";
import { SPAM_STAGE_NAME } from "@/lib/lead-qualification";
import type { PipelineColumn } from "@/types";
import { canSeeDealMoney, pageActor } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const actor = await pageActor();

  const stages = db.select().from(pipelineStages).orderBy(asc(pipelineStages.order)).all().filter((stage) => stage.name !== SPAM_STAGE_NAME);
  const visibleStageIds = new Set(stages.map((stage) => stage.id));
  const allDeals = db
    .select({
      id: deals.id,
      title: deals.title,
      value: deals.value,
      stageId: deals.stageId,
      contactId: deals.contactId,
      ownerId: deals.ownerId,
      lossReason: deals.lossReason,
      expectedClose: deals.expectedClose,
      probability: deals.probability,
      notes: deals.notes,
      createdAt: deals.createdAt,
      updatedAt: deals.updatedAt,
      contactName: contacts.name,
      contactTemperature: contacts.temperature,
      contactQualification: contacts.qualification,
      contactSource: contacts.source,
      ownerName: teamMembers.name,
    })
    .from(deals)
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(teamMembers, eq(deals.ownerId, teamMembers.id))
    .all()
    .filter((deal) => visibleStageIds.has(deal.stageId))
    // Need Number — это список обзвона, в воронку попадает только после подтверждённой заявки.
    .filter((deal) => deal.contactSource !== "need_number" || deal.contactQualification === "qualified")
    // Менеджер не видит суммы чужих сделок (-1 = скрыто).
    .map((deal) => (canSeeDealMoney(actor, deal.ownerId) ? deal : { ...deal, value: -1 }));

  // В колонках «Завершено» и «Отказ» — только последние 14 дней, иначе они разрастаются бесконечно.
  // Все закрытые сделки остаются в разделе «Сделки».
  const closedCutoff = Date.now() - 14 * 86_400_000;
  const closedStageIds = new Set(stages.filter((s) => s.isWon || s.isLost).map((s) => s.id));
  const hiddenClosed = allDeals.filter((d) => closedStageIds.has(d.stageId) && d.updatedAt.getTime() < closedCutoff).length;
  const boardDeals = allDeals.filter((d) => !closedStageIds.has(d.stageId) || d.updatedAt.getTime() >= closedCutoff);
  const schedules = getDealSchedules(boardDeals.map((deal) => deal.id));
  const withDates = boardDeals.map((deal) => ({ ...deal, deadline: schedules.get(deal.id)?.deadline || null, shippedAt: schedules.get(deal.id)?.shippedAt || null }));
  const columns: PipelineColumn[] = stages.map((stage) => ({
    ...stage,
    deals: withDates.filter((deal) => deal.stageId === stage.id) as PipelineColumn["deals"],
  }));

  const firstStageId = stages.find((x) => !x.isWon && !x.isLost)?.id;
  const leadsCount = allDeals.filter((deal) => deal.stageId === firstStageId).length;
  const total = allDeals.filter((deal) => { const st = stages.find((x) => x.id === deal.stageId); return st && !st.isWon && !st.isLost && st.id !== firstStageId; });
  const sum = total.reduce((n, d) => n + Math.max(0, Number(d.value) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Воронка</h1>
        <span className="text-sm text-slate-500">Сделок в работе {total.length}{actor.role === "owner" ? "" : " · мои"} на {new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(sum / 100)} · лидов {leadsCount}</span>
        {hiddenClosed > 0 && <a href="/deals" className="text-xs text-slate-400 hover:text-slate-700">старые закрытые ({hiddenClosed}) — в «Сделках»</a>}
        <div className="ml-auto"><NewDealButton /></div>
      </div>
      <KanbanBoard initialColumns={columns} />
    </div>
  );
}
