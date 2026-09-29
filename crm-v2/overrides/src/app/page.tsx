import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { AlertTriangle, CalendarClock, CheckCircle2, Factory, Inbox, ListTodo } from "lucide-react";
import { db } from "@/db";
import { activities, contacts, deals, pipelineStages } from "@/db/schema";
import { SPAM_STAGE_NAME } from "@/lib/lead-qualification";
import { getDealSchedules, todayYekaterinburg } from "@/lib/deal-schedule";

export const dynamic = "force-dynamic";

const money = (v: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format((Number(v) || 0) / 100);
const dayMonth = (d: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00Z`));
const time = (d: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Yekaterinburg", hour: "2-digit", minute: "2-digit" }).format(d);
function diff(from: string, to: string) { return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000); }
function plural(n: number) { const a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return "дней"; if (b === 1) return "день"; if (b >= 2 && b <= 4) return "дня"; return "дней"; }
function ymd(d: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yekaterinburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }

/** «Сегодня» — одна страница с тем, что требует действия прямо сейчас. */
export default function TodayPage() {
  const today = todayYekaterinburg();
  const stages = db.select().from(pipelineStages).orderBy(asc(pipelineStages.order)).all().filter((s) => s.name !== SPAM_STAGE_NAME);
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const rows = db.select({ id: deals.id, title: deals.title, value: deals.value, stageId: deals.stageId, createdAt: deals.createdAt, contactName: contacts.name, qualification: contacts.qualification, source: contacts.source })
    .from(deals).leftJoin(contacts, eq(deals.contactId, contacts.id)).orderBy(desc(deals.createdAt)).all()
    .filter((d) => stageById.has(d.stageId) && !["spam", "ignore", "unqualified"].includes(String(d.qualification || "")) && d.source !== "need_number");

  const schedules = getDealSchedules(rows.map((d) => d.id));
  const firstStage = stages.find((s) => !s.isWon && !s.isLost);

  // 1. Производство: горящие сроки и сделки без сроков
  const production = rows.filter((d) => stageById.get(d.stageId)?.name === "В производстве");
  const withDeadline = production
    .map((d) => ({ ...d, deadline: schedules.get(d.id)?.deadline || null }))
    .filter((d) => d.deadline)
    .map((d) => ({ ...d, left: diff(today, d.deadline!) }))
    .sort((a, b) => a.left - b.left);
  const burning = withDeadline.filter((d) => d.left <= 3);
  const noDates = production.filter((d) => !schedules.get(d.id)?.deadline);

  // 2. Задачи: просроченные и на сегодня
  const tasks = db.select({ id: activities.id, description: activities.description, scheduledAt: activities.scheduledAt, completedAt: activities.completedAt, type: activities.type, contactId: activities.contactId, contactName: contacts.name })
    .from(activities).leftJoin(contacts, eq(activities.contactId, contacts.id)).all()
    .filter((t) => !t.completedAt && t.scheduledAt && (t.type === "task" || t.scheduledAt))
    .map((t) => ({ ...t, day: ymd(t.scheduledAt as Date) }))
    .filter((t) => t.day <= today)
    .sort((a, b) => (a.scheduledAt as Date).getTime() - (b.scheduledAt as Date).getTime());

  // 3. Новые заявки (лиды) — первый этап
  const fresh = rows.filter((d) => d.stageId === firstStage?.id).slice(0, 8);

  const isDeal = (d: (typeof rows)[number]) => { const s = stageById.get(d.stageId); return Boolean(s && !s.isWon && !s.isLost && s.id !== firstStage?.id); };
  const activeSum = rows.filter(isDeal).reduce((n, d) => n + (Number(d.value) || 0), 0);
  const activeCount = rows.filter(isDeal).length;

  const allClear = !burning.length && !tasks.length && !noDates.length;

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 pb-10">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Сегодня</h1>
        <span className="text-sm text-slate-500">{new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Yekaterinburg" }).format(new Date())}</span>
        <span className="text-sm text-slate-500">· сделок в работе {activeCount} на {money(activeSum)}</span>
      </div>

      {allClear && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5" />Горящих сроков и просроченных задач нет.</div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Block icon={Factory} title="Сроки производства" href="/production" link="Всё производство" empty="В производстве ничего не горит.">
          {burning.map((d) => {
            const tone = d.left < 0 ? "text-rose-700 bg-rose-50" : d.left === 0 ? "text-rose-700 bg-rose-50" : "text-amber-800 bg-amber-50";
            const text = d.left < 0 ? `просрочено ${-d.left} ${plural(-d.left)}` : d.left === 0 ? "сегодня" : `через ${d.left} ${plural(d.left)}`;
            return <Row key={d.id} href={`/deals/${d.id}`} title={d.title || "Без названия"} sub={d.contactName || ""} right={<span className={`rounded-md px-2 py-0.5 text-[12px] font-medium ${tone}`}>{dayMonth(d.deadline!)} · {text}</span>} />;
          })}
          {noDates.length > 0 && (
            <Link href="/production" className="flex items-center gap-2 px-4 py-2.5 text-[13px] text-violet-700 hover:bg-violet-50/50">
              <AlertTriangle className="h-4 w-4" />Без даты оплаты и срока: {noDates.length} — указать
            </Link>
          )}
          {!burning.length && !noDates.length && withDeadline.length > 0 && (
            <div className="px-4 py-3 text-[13px] text-slate-500">Ближайший дедлайн — {dayMonth(withDeadline[0].deadline!)}, «{withDeadline[0].title}».</div>
          )}
        </Block>

        <Block icon={ListTodo} title="Задачи на сегодня" href="/tasks" link="Все задачи" empty="На сегодня задач нет.">
          {tasks.slice(0, 8).map((t) => {
            const overdue = t.day < today;
            return <Row key={t.id} href={`/contacts/${t.contactId}`} title={t.description} sub={t.contactName || ""} right={<span className={`text-[12px] ${overdue ? "font-medium text-rose-600" : "text-slate-500"}`}>{overdue ? `просрочено с ${dayMonth(t.day)}` : time(t.scheduledAt as Date)}</span>} />;
          })}
          {tasks.length > 8 && <Link href="/tasks" className="block px-4 py-2.5 text-[13px] text-slate-500 hover:text-slate-900">И ещё {tasks.length - 8} →</Link>}
        </Block>
      </div>

      <Block icon={Inbox} title={`Новые лиды${firstStage ? ` · ${firstStage.name}` : ""}`} href="/pipeline" link="Воронка" empty="Новых лидов нет.">
        {fresh.map((d) => <Row key={d.id} href={`/deals/${d.id}`} title={d.title || "Без названия"} sub={d.contactName || ""} right={<span className="text-[12px] text-slate-500">{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(d.createdAt)}{d.value ? ` · ${money(d.value)}` : ""}</span>} />)}
      </Block>

      <div className="flex flex-wrap gap-x-5 gap-y-1 px-1 text-[13px] text-slate-500">
        <Link href="/summary" className="inline-flex items-center gap-1.5 hover:text-slate-900"><CalendarClock className="h-3.5 w-3.5" />Цифры за день и месяц — в «Сводке»</Link>
      </div>
    </div>
  );
}

function Block({ icon: Icon, title, href, link, empty, children }: { icon: typeof Factory; title: string; href: string; link: string; empty: string; children: React.ReactNode }) {
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/[.06]">
        <Icon className="h-4 w-4 text-slate-400" /><h2 className="text-[14px] font-semibold text-slate-900 dark:text-white">{title}</h2>
        <Link href={href} className="ml-auto text-[12px] text-slate-500 hover:text-slate-900 dark:hover:text-white">{link} →</Link>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-white/[.06]">{items.length ? children : <div className="px-4 py-5 text-[13px] text-slate-400">{empty}</div>}</div>
    </section>
  );
}

function Row({ href, title, sub, right }: { href: string; title: string; sub: string; right: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-white/[.03]">
      <div className="min-w-0 flex-1"><div className="truncate text-[14px] text-slate-900 dark:text-white">{title}</div>{sub && <div className="truncate text-[12px] text-slate-500">{sub}</div>}</div>
      <div className="shrink-0">{right}</div>
    </Link>
  );
}
