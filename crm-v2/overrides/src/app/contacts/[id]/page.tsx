import { db } from "@/db";
import { contacts, deals, activities, pipelineStages } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ContactDetailClient } from "@/components/contacts/ContactDetail";
import { listClientDocuments } from "@/lib/client-documents";
import { getDealEconomics } from "@/lib/economics";
import { listProjects } from "@/lib/projects";
import { getAssistantState } from "@/lib/assistant";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = db.select().from(contacts).where(eq(contacts.id, id)).get();
  if (!contact) notFound();

  const contactDeals = db
    .select({
      id: deals.id,
      title: deals.title,
      value: deals.value,
      stageId: deals.stageId,
      probability: deals.probability,
      createdAt: deals.createdAt,
      updatedAt: deals.updatedAt,
      stageName: pipelineStages.name,
      stageColor: pipelineStages.color,
      isWon: pipelineStages.isWon,
      isLost: pipelineStages.isLost,
    })
    .from(deals)
    .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .where(eq(deals.contactId, id))
    .all();

  const contactActivities = db.select().from(activities).where(eq(activities.contactId, id)).orderBy(desc(activities.createdAt)).all();
  const projectRows = (listProjects() as Array<Record<string, unknown>>).filter((x) => String(x.contactId || "") === id);
  const projectMap = new Map(projectRows.map((x) => [String(x.dealId || ""), x]));

  const enrichedDeals = contactDeals.map((deal) => {
    const economics = (getDealEconomics(deal.id) || {}) as Record<string, unknown>;
    const received = Number(economics.receivedAmount || 0);
    const costs = ["productionCost", "paymentCommission", "deliveryCost", "packagingCost", "contractorCost", "taxCost", "otherCost"]
      .reduce((sum, key) => sum + Number(economics[key] || 0), 0);
    const profit = received - costs;
    return { ...deal, receivedAmount: received, totalCost: costs, profit, margin: received > 0 ? (profit / received) * 100 : 0, project: projectMap.get(deal.id) || null };
  });

  let assistantInsights: Array<Record<string, unknown>> = [];
  try {
    assistantInsights = getAssistantState().insights.filter((x) => String(x.entityType || "") === "contact" && String(x.entityId || "") === id).slice(0, 6);
  } catch {}

  return (
    <ContactDetailClient
      contact={contact as never}
      deals={enrichedDeals as never}
      activities={contactActivities as never}
      documents={listClientDocuments(id) as never}
      assistantInsights={assistantInsights as never}
    />
  );
}
