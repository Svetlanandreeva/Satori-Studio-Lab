import { db } from "@/db";
import { pipelineStages, deals, contacts } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { SPAM_STAGE_NAME } from "@/lib/lead-qualification";
import type { PipelineColumn } from "@/types";

export const dynamic = "force-dynamic";

const SYNTHETIC_LINK_NOTE = "Автоматически создано для связи клиента с воронкой";

function cleanupUntouchedSyntheticDeals() {
  const initialStage = db
    .select()
    .from(pipelineStages)
    .orderBy(asc(pipelineStages.order))
    .all()
    .find((stage) => stage.name === "Новый запрос") || null;
  if (!initialStage) return;

  for (const deal of db.select().from(deals).all()) {
    const untouched = deal.createdAt.getTime() === deal.updatedAt.getTime();
    if (
      deal.notes === SYNTHETIC_LINK_NOTE &&
      deal.stageId === initialStage.id &&
      Number(deal.value || 0) === 0 &&
      Number(deal.probability || 0) === 10 &&
      untouched
    ) {
      db.delete(deals).where(eq(deals.id, deal.id)).run();
    }
  }
}

export default function PipelinePage() {
  // Воронка должна содержать реальные заявки/сделки, а не техническую карточку
  // для каждого контакта. Удаляем только старые нетронутые автокарточки;
  // сделки, которые уже двигали или редактировали вручную, сохраняем.
  cleanupUntouchedSyntheticDeals();

  const stages = db
    .select()
    .from(pipelineStages)
    .orderBy(asc(pipelineStages.order))
    .all()
    .filter((stage) => stage.name !== SPAM_STAGE_NAME);

  const visibleStageIds = new Set(stages.map((stage) => stage.id));

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
    .all()
    .filter((deal) => visibleStageIds.has(deal.stageId));

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
          Только реальные заявки и сделки. Перетаскивайте их между этапами; спам хранится отдельно в «Песочнице».
        </p>
      </div>
      <KanbanBoard initialColumns={columns} />
    </div>
  );
}
