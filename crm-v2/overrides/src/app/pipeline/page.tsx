import { db } from "@/db";
import { pipelineStages, deals, contacts, teamMembers } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { NewDealButton } from "@/components/deals/DealActions";
import { SPAM_STAGE_NAME } from "@/lib/lead-qualification";
import type { PipelineColumn } from "@/types";

export const dynamic = "force-dynamic";

export default function PipelinePage() {

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
      ownerName: teamMembers.name,
    })
    .from(deals)
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(teamMembers, eq(deals.ownerId, teamMembers.id))
    .all()
    .filter((deal) => visibleStageIds.has(deal.stageId));

  const columns: PipelineColumn[] = stages.map((stage) => ({
    ...stage,
    deals: allDeals.filter((deal) => deal.stageId === stage.id) as PipelineColumn["deals"],
  }));

  const total = allDeals.filter((deal) => { const st = stages.find((x) => x.id === deal.stageId); return st && !st.isWon && !st.isLost; });
  const sum = total.reduce((n, d) => n + (Number(d.value) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Воронка</h1>
        <span className="text-sm text-slate-500">В работе {total.length} · {new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(sum / 100)}</span>
        <span className="hidden text-xs text-slate-400 lg:inline">Перетаскивай карточки между этапами · клик — открыть сделку</span>
        <div className="ml-auto"><NewDealButton /></div>
      </div>
      <KanbanBoard initialColumns={columns} />
    </div>
  );
}
