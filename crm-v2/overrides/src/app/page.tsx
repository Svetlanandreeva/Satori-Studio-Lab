import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Factory, ListTodo } from "lucide-react";
import { sqlite } from "@/db";
import { normalizeLegacyDate } from "@/lib/date-normalization";
import { describeSchedule, todayYekaterinburg } from "@/lib/deal-schedule";

export const dynamic = "force-dynamic";

const TZ = "Asia/Yekaterinburg";
const money = (v: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format((Number(v) || 0) / 100);
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const dayMonth = (d: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00Z`));
function diff(from: string, to: string) { return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000); }
function plural(n: number, one: string, few: string, many: string) { const a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return many; if (b === 1) return one; if (b >= 2 && b <= 4) return few; return many; }
function shiftMonth(m: string, delta: number) { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + delta, 1)); return d.toISOString().slice(0, 7); }
const SOURCE: Record<string, string> = { telegram: "Telegram", telegram_account: "Telegram", email: "Почта", website: "Сайт", order: "Сайт", referral: "Рекомендации", instagram: "Instagram", ads: "Реклама" };

type Stage = { id: string; name: string; color: string; order: number; isWon: number; isLost: number };
type DealRow = { id: string; title: string; value: number; stageId: string; createdAt: unknown; updatedAt: unknown; contactName: string | null; source: string | null; qualification: string | null; notes: string | null };

/** Сводка — главная: сколько пишут, что в работе, календарь сроков и воронка по этапам. */
export default async function SummaryPage({ searchParams }: { searchParams?: Promise<{ m?: string }> }) {
  const params = (await searchParams) || {};
  const today = todayYekaterinburg();
  const month = /^\d{4}-\d{2}$/.test(String(params.m || "")) ? String(params.m) : today.slice(0, 7);
  const inMonth = (v: unknown) => { const d = normalizeLegacyDate(v); return Boolean(d && ymd(d).startsWith(month)); };

  const stages = (sqlite.prepare(`SELECT id, name, color, "order" AS "order", COALESCE(is_won,0) AS isWon, COALESCE(is_lost,0) AS isLost FROM pipeline_stages ORDER BY "order"`).all() as Stage[])
    .filter((s) => !/песочн|спам/i.test(s.name));
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const first = stages.find((s) => !s.isWon && !s.isLost);

  const junk = (q: unknown, src: unknown) => ["spam", "ignore", "unqualified"].includes(String(q || "")) || src === "need_number";
  const deals = (sqlite.prepare(`SELECT d.id, d.title, d.value, d.stage_id AS stageId, d.created_at AS createdAt, d.updated_at AS updatedAt, d.notes,
      c.name AS contactName, c.source, c.qualification FROM deals d LEFT JOIN contacts c ON c.id=d.contact_id`).all() as DealRow[])
    .filter((d) => stageById.has(d.stageId) && !junk(d.qualification, d.source));

  // 1. Обращения: новые люди, которые написали в этом месяце.
  const contacts = (sqlite.prepare("SELECT id, source, qualification, created_at AS createdAt FROM contacts").all() as Array<{ id: string; source: string | null; qualification: string | null; createdAt: unknown }>)
    .filter((c) => c.source !== "need_number" && !["spam"].includes(String(c.qualification || "")) && inMonth(c.createdAt));
  const bySource = new Map<string, number>();
  for (const c of contacts) { const k = SOURCE[String(c.source || "")] || "Другое"; bySource.set(k, (bySource.get(k) || 0) + 1); }
  const takenToWork = deals.filter((d) => inMonth(d.createdAt)).length;

  const isOpen = (d: DealRow) => { const s = stageById.get(d.stageId)!; return !s.isWon && !s.isLost; };
  const open = deals.filter((d) => isOpen(d) && d.stageId !== first?.id);
  const leads = deals.filter((d) => d.stageId === first?.id);

  // 2. Сроки и оплаты (project_details: ordered_at = дата оплаты / старт).
  const pd = new Map((sqlite.prepare("SELECT deal_id AS dealId, ordered_at AS paidAt, production_term_days AS term, contract_deadline AS deadline, shipped_at AS shippedAt FROM project_details").all() as Array<{ dealId: string; paidAt: string | null; term: number | null; deadline: string | null; shippedAt: string | null }>).map((r) => [r.dealId, r]));
  let econ = new Map<string, number>();
  try { econ = new Map((sqlite.prepare("SELECT deal_id AS dealId, received_amount AS r FROM deal_economics").all() as Array<{ dealId: string; r: number }>).map((r) => [r.dealId, Number(r.r) || 0])); } catch {}
  const paidThisMonth = deals.filter((d) => String(pd.get(d.id)?.paidAt || "").startsWith(month));
  const receivedThisMonth = paidThisMonth.reduce((n, d) => n + (econ.get(d.id) || 0), 0);

  const scheduled = deals.map((d) => {
    const r = pd.get(d.id);
    const s = describeSchedule(r?.paidAt || null, r?.term ? Number(r.term) : null, r?.deadline || null, r?.shippedAt || null, today);
    return { ...d, ...s, stage: stageById.get(d.stageId)! };
  });
  const production = scheduled.filter((d) => d.stage.name === "В производстве");
  const burning = production.filter((d) => d.deadline && !d.shippedAt && diff(today, d.deadline) <= 3).sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));
  const noDates = production.filter((d) => !d.deadline).length;

  // 3. Задачи на сегодня и просроченные.
  const tasks = (sqlite.prepare(`SELECT a.id, a.description, a.scheduled_at AS scheduledAt, a.contact_id AS contactId, c.name AS contactName FROM activities a LEFT JOIN contacts c ON c.id=a.contact_id
      WHERE a.completed_at IS NULL AND a.scheduled_at IS NOT NULL`).all() as Array<{ id: string; description: string; scheduledAt: unknown; contactId: string; contactName: string | null }>)
    .map((t) => ({ ...t, day: (() => { const d = normalizeLegacyDate(t.scheduledAt); return d ? ymd(d) : "9999"; })() }))
    .filter((t) => t.day <= today).sort((a, b) => a.day.localeCompare(b.day));

  // 4. Календарь: дедлайны месяца.
  const [y, mo] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(y, mo - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lead = (firstDay.getUTCDay() + 6) % 7; // понедельник — первый
  const byDay = new Map<string, typeof scheduled>();
  for (const d of scheduled) {
    if (!d.deadline || !d.deadline.startsWith(month) || d.stage.isLost) continue;
    const list = byDay.get(d.deadline) || []; list.push(d); byDay.set(d.deadline, list);
  }
  const cells: Array<string | null> = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const monthTitle = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(firstDay);

  // 5. Воронка по этапам.
  const stageRows = stages.map((s) => {
    const list = deals.filter((d) => d.stageId === s.id && (!(s.isWon || s.isLost) || inMonth(d.updatedAt)));
    return { ...s, count: list.length, sum: list.reduce((n, d) => n + (Number(d.value) || 0), 0) };
  });
  const maxCount = Math.max(1, ...stageRows.map((s) => s.count));

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Сводка</h1>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm dark:border-white/[.08] dark:bg-[#16181d]">
          <Link href={`/?m=${shiftMonth(month, -1)}`} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Предыдущий месяц"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-[120px] text-center font-medium capitalize">{monthTitle}</span>
          <Link href={`/?m=${shiftMonth(month, 1)}`} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Следующий месяц"><ChevronRight className="h-4 w-4" /></Link>
        </div>
        {month !== today.slice(0, 7) && <Link href="/" className="text-xs text-slate-500 hover:text-slate-900">к текущему месяцу</Link>}
      </div>

      {/* Цифры месяца */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Написали" value={String(contacts.length)} hint={[...bySource].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ") || "новых обращений нет"} />
        <Kpi label="Взято в работу" value={String(takenToWork)} hint={contacts.length ? `${Math.round((takenToWork / contacts.length) * 100)}% от обращений` : "—"} />
        <Kpi label="Сделок в работе" value={String(open.length)} hint={`на ${money(open.reduce((n, d) => n + (Number(d.value) || 0), 0))} · лидов ${leads.length}`} />
        <Kpi label="Оплаты за месяц" value={money(receivedThisMonth)} hint={`${paidThisMonth.length} ${plural(paidThisMonth.length, "заказ", "заказа", "заказов")} стартовали`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Block icon={Factory} title="Горят сроки" href="/production" link="Производство">
          {burning.length ? burning.map((d) => {
            const left = diff(today, d.deadline!);
            const text = left < 0 ? `просрочено ${-left} ${plural(-left, "день", "дня", "дней")}` : left === 0 ? "сегодня" : `через ${left} ${plural(left, "день", "дня", "дней")}`;
            return <Row key={d.id} href={`/deals/${d.id}`} title={d.title} sub={d.contactName || ""} right={<span className={`rounded-md px-2 py-0.5 text-[12px] font-medium ${left <= 0 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>{dayMonth(d.deadline!)} · {text}</span>} />;
          }) : <Empty text={production.length ? "Всё в срок." : "Сейчас ничего не в производстве."} />}
          {noDates > 0 && <Link href="/production" className="flex items-center gap-2 px-4 py-2.5 text-[13px] text-violet-700 hover:bg-violet-50/50"><AlertTriangle className="h-4 w-4" />Без даты оплаты и срока: {noDates}</Link>}
        </Block>
        <Block icon={ListTodo} title="Задачи на сегодня" href="/tasks" link="Все задачи">
          {tasks.length ? tasks.slice(0, 6).map((t) => <Row key={t.id} href={`/contacts/${t.contactId}`} title={t.description} sub={t.contactName || ""} right={<span className={`text-[12px] ${t.day < today ? "font-medium text-rose-600" : "text-slate-500"}`}>{t.day < today ? `с ${dayMonth(t.day)}` : "сегодня"}</span>} />) : <Empty text="На сегодня задач нет." />}
          {tasks.length > 6 && <Link href="/tasks" className="block px-4 py-2.5 text-[13px] text-slate-500 hover:text-slate-900">И ещё {tasks.length - 6} →</Link>}
        </Block>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        {/* Календарь сроков */}
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/[.06]">
            <h2 className="text-[14px] font-semibold">Календарь сроков · <span className="capitalize">{monthTitle}</span></h2>
            <div className="flex gap-3 text-[11px] text-slate-500"><Legend c="bg-orange-500" t="в работе" /><Legend c="bg-rose-500" t="просрочено" /><Legend c="bg-emerald-500" t="отправлено" /></div>
          </div>
          <div className="grid grid-cols-7 border-b border-slate-100 text-center text-[11px] text-slate-400 dark:border-white/[.06]">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => <div key={d} className="py-1.5">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const items = day ? byDay.get(day) || [] : [];
              return (
                <div key={i} className={`min-h-[78px] border-b border-r border-slate-100 p-1 dark:border-white/[.06] ${day === today ? "bg-violet-50/60 dark:bg-violet-500/10" : ""} ${!day ? "bg-slate-50/50 dark:bg-transparent" : ""}`}>
                  {day && <div className={`px-1 text-[11px] ${day === today ? "font-semibold text-violet-700" : "text-slate-400"}`}>{Number(day.slice(8))}</div>}
                  <div className="space-y-0.5">
                    {items.slice(0, 3).map((d) => {
                      const color = d.shippedAt || d.stage.isWon ? "bg-emerald-50 text-emerald-800 border-emerald-200" : d.deadline! < today ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-orange-50 text-orange-800 border-orange-200";
                      return <Link key={d.id} href={`/deals/${d.id}`} title={`${d.title} · ${d.contactName || ""}`} className={`block truncate rounded border px-1 py-0.5 text-[10.5px] leading-tight ${color}`}>{d.title}</Link>;
                    })}
                    {items.length > 3 && <div className="px-1 text-[10px] text-slate-400">+{items.length - 3}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Воронка по этапам */}
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/[.06]"><h2 className="text-[14px] font-semibold">Воронка по этапам</h2><Link href="/pipeline" className="text-[12px] text-slate-500 hover:text-slate-900">Открыть →</Link></div>
          <div className="space-y-2.5 p-4">
            {stageRows.map((s) => (
              <Link key={s.id} href="/pipeline" className="block">
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}{s.id === first?.id ? <span className="text-[11px] text-slate-400">· лиды</span> : null}{s.isWon || s.isLost ? <span className="text-[11px] text-slate-400">· за месяц</span> : null}</span>
                  <span className="tabular-nums text-slate-500"><b className="font-semibold text-slate-900 dark:text-white">{s.count}</b>{s.sum ? ` · ${money(s.sum)}` : ""}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[.06]"><div className="h-full rounded-full" style={{ width: `${(s.count / maxCount) * 100}%`, background: s.color }} /></div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-white/[.08] dark:bg-[#16181d]"><div className="text-[12px] text-slate-500">{label}</div><div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-slate-950 dark:text-white">{value}</div><div className="mt-0.5 truncate text-[11.5px] text-slate-400" title={hint}>{hint}</div></div>;
}
function Legend({ c, t }: { c: string; t: string }) { return <span className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-sm ${c}`} />{t}</span>; }
function Empty({ text }: { text: string }) { return <div className="px-4 py-5 text-[13px] text-slate-400">{text}</div>; }
function Block({ icon: Icon, title, href, link, children }: { icon: typeof Factory; title: string; href: string; link: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/[.06]"><Icon className="h-4 w-4 text-slate-400" /><h2 className="text-[14px] font-semibold">{title}</h2><Link href={href} className="ml-auto text-[12px] text-slate-500 hover:text-slate-900">{link} →</Link></div>
      <div className="divide-y divide-slate-100 dark:divide-white/[.06]">{children}</div>
    </section>
  );
}
function Row({ href, title, sub, right }: { href: string; title: string; sub: string; right: React.ReactNode }) {
  return <Link href={href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-white/[.03]"><div className="min-w-0 flex-1"><div className="truncate text-[14px]">{title}</div>{sub && <div className="truncate text-[12px] text-slate-500">{sub}</div>}</div><div className="shrink-0">{right}</div></Link>;
}
