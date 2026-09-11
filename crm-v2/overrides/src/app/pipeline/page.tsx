import { db } from "@/db";
import { pipelineStages, deals, contacts } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import type { PipelineColumn } from "@/types";

export const dynamic = "force-dynamic";

export default function PipelinePage() {
  const stages = db
    .select()
    .from(pipelineStages)
    .orderBy(asc(pipelineStages.order))
    .all();

  const allDeals = db
    .select({
      id: deals.id,
      title: deals.title,
      value: deals.value,
      stageId: deals.stageId,
      contactId: deals.contactId,
      expectedClose: deals.expectedClose,
      probability: deals.probability,
      notes: deals.notes,
      createdAt: deals.createdAt,
      updatedAt: deals.updatedAt,
      contactName: contacts.name,
      contactTemperature: contacts.temperature,
      contactQualification: contacts.qualification,
    })
    .from(deals)
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .all();

  const columns: PipelineColumn[] = stages.map((stage) => ({
    ...stage,
    deals: allDeals
      .filter((deal) => deal.stageId === stage.id)
      .map((deal) => ({
        ...deal,
        contactName: deal.contactName,
        contactTemperature: deal.contactTemperature,
        contactQualification: deal.contactQualification,
      })) as PipelineColumn["deals"],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Воронка</h1>
        <p className="text-muted-foreground">
          Перетаскивайте сделки между этапами. Квалификацию лида можно менять прямо в карточке.
        </p>
      </div>
      <KanbanBoard initialColumns={columns} />
    </div>
  );
}
