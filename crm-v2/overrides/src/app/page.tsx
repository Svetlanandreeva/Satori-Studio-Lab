import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Factory, ListTodo } from "lucide-react";
import { sqlite } from "@/db";
import { normalizeLegacyDate } from "@/lib/date-normalization";
import { describeSchedule, todayYekaterinburg } from "@/lib/deal-schedule";
import { monthInquiries } from "@/lib/inquiries";

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

  const junk = (q: unknown, src: unknown) => ["spam", "ignore", "unqualified", "contractor"].includes(String(q || "")) || (src === "need_number" && q !== "qualified");
  const deals = (sqlite.prepare(`SELECT d.id, d.title, d.value, d.stage_id AS stageId, d.created_at AS createdAt, d.updated_at AS updatedAt, d.notes,
      c.name AS contactName, c.source, c.qualification FROM deals d LEFT JOIN contacts c ON c.id=d.contact_id`).all() as DealRow[])
    .filter((d) => stageById.has(d.stageId) && !junk(d.qualification, d.source));

  // 1. Обращения: новые люди, которые написали в этом месяце.
  // Не считаем: Need Number, подрядчиков, дубли и контакты только из сервисных писем.
  const contacts = monthInquiries(month);
  const bySource = new Map<string, number>();
  for (const c of contacts) { const k = SOURCE[String(c.source || "")] || "Другое"; bySource.set(k, (bySource.get(k) || 0) + 1); }
  const cnt = (st: string) => contacts.filter((c) => c.status === st).length;
  const takenToWork = cnt("work"), junkCount = cnt("junk"), waiting = cnt("wait");
  const junkReasons = new Map<string, number>();
  for (const c of contacts) if (c.status === "junk") { const r = c.reason || (c.qualification === "spam" ? "Спам / реклама" : "Без причины"); junkReasons.set(r, (junkReasons.get(r) || 0) + 1); }

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

  // 4. Шкала сроков: каждый проект — полоса от оплаты до дедлайна (или отгрузки) по дням месяца.
  const [y, mo] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(y, mo - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const monthStart = days[0], monthEnd = days[days.length - 1];
  const addD = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const timeline = scheduled
    .filter((d) => !d.stage.isLost && (d.paidAt || d.deadline))
    .map((d) => {
      const start = d.paidAt || (d.deadline && d.termDays ? addD(d.deadline, -d.termDays) : d.deadline)!;
      const done = Boolean(d.shippedAt || d.stage.isWon);
      const planEnd = d.deadline || start;
      const overdue = !done && d.deadline && d.deadline < today;
      const end = d.shippedAt || (overdue ? today : planEnd);
      return { ...d, start, end, planEnd, done, overdue };
    })
    .filter((d) => d.start <= monthEnd && d.end >= monthStart)
    .sort((a, b) => a.start.localeCompare(b.start) || String(a.planEnd).localeCompare(String(b.planEnd)));
  const col = (d: string) => (d < monthStart ? 1 : d > monthEnd ? daysInMonth + 1 : Number(d.slice(8))) + 1; // +1 — колонка с названием
  const monthTitle = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(firstDay);
  const weekend = (d: string) => { const w = new Date(`${d}T12:00:00Z`).getUTCDay(); return w === 0 || w === 6; };

  // Обращения по дням
  const perDay = days.map((d) => { const l = contacts.filter((c) => c.day === d); return { d, work: l.filter((c) => c.status === "work").length, junk: l.filter((c) => c.status === "junk").length, wait: l.filter((c) => c.status === "wait").length, total: l.length }; });
  const maxPerDay = Math.max(1, ...perDay.map((x) => x.total));

  // 5. Воронка по этапам.
  const stageRows = stages.map((s) => {
    const list = deals.filter((d) => d.stageId === s.id && (!(s.isWon || s.isLost) || inMonth(d.updatedAt)));
    return { ...s, count: list.length, sum: list.reduce((n, d) => n + (Number(d.value) || 0), 0) };
  });

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
        <Kpi label="Новых обращений" value={String(contacts.length)} hint={[...bySource].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ") || "новых обращений нет"} />
        <Kpi label="Взято в работу" value={String(takenToWork)} hint={contacts.length ? `${Math.round((takenToWork / contacts.length) * 100)}% · не квал ${junkCount} · ждут ${waiting}` : "—"} />
        <Kpi label="Сделок в работе" value={String(open.length)} hint={`на ${money(open.reduce((n, d) => n + (Number(d.value) || 0), 0))} · лидов ${leads.length}`} />
        <Kpi label="Оплаты за месяц" value={money(receivedThisMonth)} hint={`${paidThisMonth.length} ${plural(paidThisMonth.length, "заказ", "заказа", "заказов")} стартовали`} />
      </div>

      {/* Воронка — одной строкой */}
      <div className="flex flex-wrap items-center gap-1.5">
        {stageRows.filter((s) => !(s.isWon || s.isLost) || s.count > 0).map((s) => (
          <Link key={s.id} href="/pipeline" className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-3 py-1 text-[12.5px] hover:bg-slate-50 dark:border-white/[.08] dark:bg-[#16181d]">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}<b className="font-semibold tabular-nums">{s.count}</b>{s.isWon || s.isLost ? <span className="text-[11px] text-slate-400">за месяц</span> : null}
          </Link>
        ))}
      </div>

      {/* Сегодня: горящие сроки и задачи в одном списке */}
      {(burning.length > 0 || tasks.length > 0 || noDates > 0) ? (
        <Block icon={ListTodo} title="Сегодня" href="/tasks" link="Все задачи">
          {burning.map((d) => {
            const left = diff(today, d.deadline!);
            const text = left < 0 ? `просрочено ${-left} ${plural(-left, "день", "дня", "дней")}` : left === 0 ? "дедлайн сегодня" : `дедлайн через ${left} ${plural(left, "день", "дня", "дней")}`;
            return <Row key={d.id} href={`/deals/${d.id}`} title={d.title} sub={d.contactName || ""} right={<span className={`rounded-md px-2 py-0.5 text-[12px] font-medium ${left <= 0 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>{text}</span>} />;
          })}
          {tasks.slice(0, 6).map((t) => <Row key={t.id} href={`/contacts/${t.contactId}`} title={t.description} sub={t.contactName || ""} right={<span className={`text-[12px] ${t.day < today ? "font-medium text-rose-600" : "text-slate-500"}`}>{t.day < today ? `задача с ${dayMonth(t.day)}` : "задача"}</span>} />)}
          {tasks.length > 6 && <Link href="/tasks" className="block px-4 py-2.5 text-[13px] text-slate-500 hover:text-slate-900">И ещё {tasks.length - 6} задач →</Link>}
        </Block>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-[13px] text-slate-500 dark:border-white/[.08]">На сегодня всё спокойно: сроки не горят, задач нет.</div>
      )}

      {/* Шкала сроков по дням */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/[.06]">
          <h2 className="text-[14px] font-semibold">Сроки проектов · <span className="capitalize">{monthTitle}</span></h2>
          <div className="flex gap-3 text-[11px] text-slate-500"><Legend c="bg-orange-400" t="в работе" /><Legend c="bg-rose-500" t="просрочка" /><Legend c="bg-emerald-500" t="отправлено" /><span className="inline-flex items-center gap-1"><span className="h-3 w-0.5 bg-violet-500" />сегодня</span></div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid border-b border-slate-100 text-[10px] text-slate-400 dark:border-white/[.06]" style={{ gridTemplateColumns: `180px repeat(${daysInMonth}, minmax(0,1fr))` }}>
              <div className="px-3 py-1.5">Проект</div>
              {days.map((d) => <div key={d} className={`py-1.5 text-center tabular-nums ${d === today ? "font-semibold text-violet-700" : weekend(d) ? "text-slate-300" : ""}`}>{Number(d.slice(8))}</div>)}
            </div>
            {timeline.length ? timeline.map((d) => {
              const barEnd = d.done ? d.end : d.planEnd;
              const color = d.done ? "bg-emerald-500" : "bg-orange-400";
              const title = `${d.title}${d.contactName ? ` · ${d.contactName}` : ""}\nстарт ${dayMonth(d.start)}${d.deadline ? ` · дедлайн ${dayMonth(d.deadline)}` : ""}${d.shippedAt ? ` · отправлено ${dayMonth(d.shippedAt)}` : ""}`;
              return (
                <Link key={d.id} href={`/deals/${d.id}`} title={title} className="group relative grid items-center border-b border-slate-50 hover:bg-slate-50/70 dark:border-white/[.04] dark:hover:bg-white/[.03]" style={{ gridTemplateColumns: `180px repeat(${daysInMonth}, minmax(0,1fr))` }}>
                  <div className="min-w-0 px-3 py-1.5"><div className="truncate text-[12.5px] font-medium">{d.title}</div><div className="truncate text-[11px] text-slate-400">{d.contactName}{d.deadline ? ` · до ${dayMonth(d.deadline)}` : ""}</div></div>
                  {days.map((day, i) => <div key={day} className={`h-full ${day === today ? "border-x border-violet-400/70 bg-violet-50/50 dark:bg-violet-500/10" : weekend(day) ? "bg-slate-50/70 dark:bg-white/[.02]" : ""}`} style={{ gridColumn: i + 2, gridRow: 1 }} />)}
                  {barEnd >= monthStart && d.start <= monthEnd && <div className={`z-10 h-4 rounded ${color} ${d.start < monthStart ? "rounded-l-none" : ""} ${barEnd > monthEnd ? "rounded-r-none" : ""}`} style={{ gridColumn: `${col(d.start)} / ${col(barEnd < d.start ? d.start : barEnd) + 1}`, gridRow: 1 }} />}
                  {d.overdue && d.deadline! < monthEnd && today >= monthStart && <div className="z-10 h-4 rounded-r bg-rose-500" style={{ gridColumn: `${col(addD(d.deadline!, 1))} / ${col(today) + 1}`, gridRow: 1 }} />}
                </Link>
              );
            }) : <Empty text="В этом месяце нет проектов с датой оплаты и сроком." />}
          </div>
        </div>
        {noDates > 0 && <Link href="/production" className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-[13px] text-violet-700 hover:bg-violet-50/50 dark:border-white/[.06]"><AlertTriangle className="h-4 w-4" />В производстве без даты оплаты и срока: {noDates} — их нет на шкале</Link>}
      </section>

      <div>
        {/* Обращения по дням */}
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/[.06]">
            <h2 className="text-[14px] font-semibold">Обращения по дням</h2>
            <div className="flex gap-3 text-[11px] text-slate-500"><Legend c="bg-emerald-500" t={`в работу ${takenToWork}`} /><Legend c="bg-slate-400" t={`не квал ${junkCount}`} /><Legend c="bg-sky-200" t={`ждут ${waiting}`} /></div>
          </div>
          <div className="px-4 pb-3 pt-4">
            <div className="flex h-40 items-end gap-[3px]">
              {perDay.map((x) => (
                <div key={x.d} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${dayMonth(x.d)}: написали ${x.total} · в работу ${x.work} · не квал ${x.junk} · ждут ${x.wait}`}>
                  {x.total > 0 && <div className="mb-0.5 text-center text-[10px] tabular-nums text-slate-500">{x.total}</div>}
                  <div className="flex w-full flex-col overflow-hidden rounded-t-[3px]" style={{ height: `${(x.total / maxPerDay) * 100}%` }}>
                    <div className="bg-sky-200" style={{ flex: x.wait }} /><div className="bg-slate-400" style={{ flex: x.junk }} /><div className="bg-emerald-500" style={{ flex: x.work }} />
                  </div>
                  {x.total === 0 && <div className="h-[2px] w-full rounded bg-slate-100 dark:bg-white/[.06]" />}
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-[3px] text-center text-[9.5px] tabular-nums">
              {perDay.map((x) => <div key={x.d} className={`min-w-0 flex-1 ${x.d === today ? "font-semibold text-violet-700" : weekend(x.d) ? "text-slate-300" : "text-slate-400"}`}>{Number(x.d.slice(8))}</div>)}
            </div>
            {junkReasons.size > 0 && <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]"><span className="text-slate-500">Не квал:</span>{[...junkReasons].sort((a, b) => b[1] - a[1]).map(([r, n]) => <span key={r} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-white/[.06] dark:text-slate-300">{r} · {n}</span>)}</div>}
            <p className="mt-3 text-[11.5px] text-slate-400">Считаются новые люди, которые написали сами (если первыми написали мы — это не обращение). Не входят: сервисные письма, подрядчики, Need Number и дубли. «Ждут» — статус в «Сообщениях» ещё не поставлен.</p>
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
