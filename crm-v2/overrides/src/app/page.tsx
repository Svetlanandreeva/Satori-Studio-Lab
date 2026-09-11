import { db } from "@/db";
import { contacts, deals, activities, pipelineStages } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { KPICards } from "@/components/dashboard/KPICards";
import { PipelineChart } from "@/components/dashboard/PipelineChart";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { NotificationBanner } from "@/components/dashboard/NotificationBanner";
import { SPAM_STAGE_NAME } from "@/lib/lead-qualification";
import type { DashboardStats } from "@/types";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const visibleContacts = db
    .select()
    .from(contacts)
    .all()
    .filter((contact) => contact.qualification !== "spam");
  const visibleContactIds = new Set(visibleContacts.map((contact) => contact.id));

  const stages = db
    .select()
    .from(pipelineStages)
    .orderBy(asc(pipelineStages.order))
    .all()
    .filter((stage) => stage.name !== SPAM_STAGE_NAME);
  const visibleStageIds = new Set(stages.map((stage) => stage.id));

  const allDeals = db
    .select()
    .from(deals)
    .all()
    .filter(
      (deal) => visibleContactIds.has(deal.contactId) && visibleStageIds.has(deal.stageId)
    );

  const activeDeals = allDeals.filter((deal) => {
    const stage = stages.find((item) => item.id === deal.stageId);
    return stage && !stage.isWon && !stage.isLost;
  });

  const wonDeals = allDeals.filter((deal) => {
    const stage = stages.find((item) => item.id === deal.stageId);
    return stage?.isWon;
  });

  const stats: DashboardStats = {
    totalContacts: visibleContacts.length,
    activeDeals: activeDeals.length,
    totalPipelineValue: activeDeals.reduce((sum, deal) => sum + deal.value, 0),
    wonDealsValue: wonDeals.reduce((sum, deal) => sum + deal.value, 0),
    conversionRate:
      allDeals.length > 0 ? Math.round((wonDeals.length / allDeals.length) * 100) : 0,
    hotLeads: visibleContacts.filter((contact) => contact.temperature === "hot").length,
  };

  const pipelineData = stages
    .filter((stage) => !stage.isLost)
    .map((stage) => ({
      name: stage.name,
      count: allDeals.filter((deal) => deal.stageId === stage.id).length,
      value: allDeals
        .filter((deal) => deal.stageId === stage.id)
        .reduce((sum, deal) => sum + deal.value, 0),
      color: stage.color,
    }));

  const recentActivities = db
    .select({
      id: activities.id,
      type: activities.type,
      description: activities.description,
      contactId: activities.contactId,
      contactName: contacts.name,
      createdAt: activities.createdAt,
    })
    .from(activities)
    .leftJoin(contacts, eq(activities.contactId, contacts.id))
    .orderBy(desc(activities.createdAt))
    .all()
    .filter((activity) => visibleContactIds.has(activity.contactId))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Главная</h1>
        <p className="text-muted-foreground">
          Клиенты, сделки и производство Satori. Спам в показатели не попадает.
        </p>
      </div>

      <NotificationBanner />
      <KPICards stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PipelineChart data={pipelineData} />
        </div>
        <div>
          <RecentActivity
            activities={recentActivities as Array<{
              id: string;
              type: string;
              description: string;
              contactName: string | null;
              createdAt: number | Date;
            }>}
          />
        </div>
      </div>
    </div>
  );
}
