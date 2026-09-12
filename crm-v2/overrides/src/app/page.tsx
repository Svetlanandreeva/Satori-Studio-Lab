import Link from "next/link";
import { db } from "@/db";
import { contacts, deals, activities, pipelineStages } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { PipelineChart } from "@/components/dashboard/PipelineChart";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { DailyBriefPanel } from "@/components/assistant/DailyBriefPanel";
import { SPAM_STAGE_NAME } from "@/lib/lead-qualification";
import { ArrowRight, FolderKanban, MessageCircle, Sparkles, Users } from "lucide-react";

export const dynamic = "force-dynamic";

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", hour12: false }).format(new Date()));
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

export default function DashboardPage() {
  const visibleContacts = db.select().from(contacts).all().filter((contact) => contact.qualification !== "spam");
  const visibleContactIds = new Set(visibleContacts.map((contact) => contact.id));
  const stages = db.select().from(pipelineStages).orderBy(asc(pipelineStages.order)).all().filter((stage) => stage.name !== SPAM_STAGE_NAME);
  const visibleStageIds = new Set(stages.map((stage) => stage.id));
  const allDeals = db.select().from(deals).all().filter((deal) => visibleContactIds.has(deal.contactId) && visibleStageIds.has(deal.stageId));

  const pipelineData = stages
    .filter((stage) => !stage.isLost)
    .map((stage) => ({
      name: stage.name,
      count: allDeals.filter((deal) => deal.stageId === stage.id).length,
      value: allDeals.filter((deal) => deal.stageId === stage.id).reduce((sum, deal) => sum + deal.value, 0),
      color: stage.color,
    }));

  const recentActivities = db
    .select({ id: activities.id, type: activities.type, description: activities.description, contactId: activities.contactId, contactName: contacts.name, createdAt: activities.createdAt })
    .from(activities)
    .leftJoin(contacts, eq(activities.contactId, contacts.id))
    .orderBy(desc(activities.createdAt))
    .all()
    .filter((activity) => visibleContactIds.has(activity.contactId))
    .slice(0, 6);

  const today = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 pb-10" aria-label="Главная">
      <span className="sr-only">Главная</span>
      <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-slate-400">
              <span className="capitalize">{today}</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">{greeting()}</h1>
            <p className="mt-2 max-w-xl text-[15px] leading-6 text-slate-500">Здесь только то, что нужно для работы сегодня: кому ответить, что горит по проектам и что происходит с деньгами.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex">
            <QuickLink href="/inbox" icon={MessageCircle} label="Сообщения" />
            <QuickLink href="/projects" icon={FolderKanban} label="Проекты" />
            <QuickLink href="/contacts" icon={Users} label="Клиенты" />
            <QuickLink href="/assistant" icon={Sparkles} label="Помощник" accent />
          </div>
        </div>
      </section>

      <DailyBriefPanel />

      <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-[16px] font-semibold text-slate-950">Воронка</h2>
              <p className="mt-0.5 text-[12px] text-slate-400">Где сейчас находятся клиенты и деньги</p>
            </div>
            <Link href="/pipeline" className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-600 hover:text-slate-950">Открыть <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="p-1 sm:p-3"><PipelineChart data={pipelineData} /></div>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-[16px] font-semibold text-slate-950">Последние изменения</h2>
            <p className="mt-0.5 text-[12px] text-slate-400">Что происходило в CRM</p>
          </div>
          <RecentActivity activities={recentActivities as Array<{ id: string; type: string; description: string; contactName: string | null; createdAt: number | Date }>} />
        </div>
      </section>
    </div>
  );
}

function QuickLink({ href, icon: Icon, label, accent = false }: { href: string; icon: typeof MessageCircle; label: string; accent?: boolean }) {
  return (
    <Link href={href} className={`flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 text-[13px] font-medium transition-all hover:-translate-y-0.5 ${accent ? "border-slate-950 bg-slate-950 text-white shadow-sm" : "border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-white hover:shadow-sm"}`}>
      <Icon className={`h-[18px] w-[18px] ${accent ? "text-white" : "text-slate-400"}`} />
      <span>{label}</span>
    </Link>
  );
}
