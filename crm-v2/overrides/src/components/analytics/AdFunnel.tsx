import { Settings2 } from "lucide-react";
import { adFunnel, manualAdSpend, metrikaSettings } from "@/lib/metrika";
import { monthInquiries, type Inquiry } from "@/lib/inquiries";
import { MetrikaSetup } from "@/components/analytics/MetrikaSetup";
import { AdCharts } from "@/components/analytics/AdCharts";
import { ChevronRight } from "lucide-react";

const n = (v: number) => new Intl.NumberFormat("ru-RU").format(Math.round(v));
const rub = (v: number) => `${n(v)} ₽`;
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString("ru-RU", { maximumFractionDigits: a / b < 0.1 ? 1 : 0 })}%` : "—");

const SOURCE: Record<string, string> = { ads: "Реклама (сайт)", website: "Сайт", order: "Сайт", telegram: "Telegram-бот", telegram_account: "Telegram", email: "Почта", referral: "Рекомендации", instagram: "Instagram" };
const isAd = (i: Inquiry) => i.source === "ads";

type Row = { label: string; hint: string; ad: number | null; all: number | null; base?: "visits" | "inq"; money?: boolean };

/** Сквозная аналитика за месяц: реклама → сайт → CRM → деньги. */
export async function AdFunnel({ month }: { month: string }) {
  const [f, inq] = [await adFunnel(month), monthInquiries(month)];
  const s = metrikaSettings();
  const adInq = inq.filter(isAd);
  const crm = (l: Inquiry[]) => ({ inq: l.length, work: l.filter((i) => i.status === "work").length, paid: l.filter((i) => i.paid).length, revenue: l.reduce((x, i) => x + i.received, 0) / 100 });
  const A = crm(adInq), T = crm(inq);
  const ad = f.ad, all = f.all;
  const adActions = ad ? ad.messengers + ad.leads + ad.orders : 0;

  const site: Row[] = [
    { label: "Визиты на сайт", hint: "по Метрике", ad: ad?.visits ?? null, all: all?.visits ?? null },
    { label: "Написали или позвонили", hint: "клик в Telegram, WhatsApp, телефон", ad: ad?.messengers ?? null, all: all?.messengers ?? null, base: "visits" },
    { label: "Заявка с формы", hint: "«На заказ» / «Бизнесу» — сразу падает в CRM", ad: ad?.leads ?? null, all: all?.leads ?? null, base: "visits" },
    { label: "Заказ в магазине", hint: "оформили или быстрый заказ", ad: ad?.orders ?? null, all: all?.orders ?? null, base: "visits" },
  ];
  const crmRows: Row[] = [
    { label: "Обращения", hint: "люди написали сами, все каналы", ad: A.inq, all: T.inq },
    { label: "Взяли в работу", hint: "сделка дальше первого этапа", ad: A.work, all: T.work, base: "inq" },
    { label: "Оплатили", hint: "есть оплата или сделка завершена", ad: A.paid, all: T.paid, base: "inq" },
    { label: "Получено денег", hint: "оплаты по этим обращениям", ad: A.revenue, all: T.revenue, money: true },
  ];

  const bySource = new Map<string, Inquiry[]>();
  for (const i of inq) { const k = SOURCE[String(i.source || "")] || "Другое"; bySource.set(k, [...(bySource.get(k) || []), i]); }
  const sources = [...bySource].map(([k, l]) => ({ k, ...crm(l) })).sort((a, b) => b.inq - a.inq);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-white/[.06]">
          <h2 className="text-[15px] font-semibold">Сквозная воронка</h2>
          <span className="text-[12px] text-slate-400">реклама → сайт → CRM → деньги</span>
          <span className="ml-auto text-[12px] text-slate-400">Директ · Метрика {s.counterId}</span>
        </div>
        <div className="space-y-5 p-5">
          {!f.configured && <div className="space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-white/[.04]"><p className="text-[13px] text-slate-600 dark:text-slate-300">Подключи Метрику — появятся визиты и действия на сайте. Часть CRM ниже работает и без неё.</p><MetrikaSetup configured={false} counterId={s.counterId} month={month} spend={manualAdSpend(month)} /></div>}
          {f.error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">Метрика: {f.error}</div>}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Расход на рекламу" value={f.cost != null ? rub(f.cost) : "—"} hint={f.costSource === "direct" ? "из Директа" : f.costSource === "manual" ? "введено вручную" : f.costError ? `Директ: ${f.costError}` : "впиши в настройках ниже"} />
            <Kpi label="Цена действия с рекламы" value={f.cost && adActions ? rub(f.cost / adActions) : "—"} hint={`${n(adActions)}: написали, заявки, заказы`} />
            <Kpi label="Получено за месяц" value={rub(T.revenue)} hint={`${T.paid} оплат · с рекламы ${rub(A.revenue)}`} />
            <Kpi label="Доля рекламы в выручке" value={f.cost && T.revenue ? pct(f.cost, T.revenue) : "—"} hint="расход ÷ все деньги месяца (ДРР)" />
          </div>

          {/* Путь клиента: от визита до денег, между шагами — конверсия */}
          <div>
            <div className="mb-2 text-[12px] font-medium text-slate-500">Путь клиента за месяц</div>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
              <Step tone="ad" label="С рекламы" value={ad ? n(ad.visits) : "—"} sub={all ? `из ${n(all.visits)} визитов` : "визиты по Метрике"} />
              <Arrow v={ad ? pct(adActions, ad.visits) : null} />
              <Step tone="ad" label="Написали, заявки" value={ad ? n(adActions) : "—"} sub={ad ? `написали ${ad.messengers}, заявки ${ad.leads}, заказы ${ad.orders}` : ""} />
              <Arrow v={null} gap />
              <Step label="Обращения" value={n(T.inq)} sub="в CRM, все каналы" />
              <Arrow v={pct(T.work, T.inq)} />
              <Step label="В работе" value={n(T.work)} sub="дальше 1-го этапа" />
              <Arrow v={pct(T.paid, T.work)} />
              <Step tone="money" label="Оплатили" value={n(T.paid)} sub={`получено ${rub(T.revenue)}`} />
            </div>
          </div>

          <AdCharts daily={f.daily} />

          <details className="rounded-xl border border-slate-100 dark:border-white/[.06]">
            <summary className="cursor-pointer list-none px-4 py-2.5 text-[12.5px] text-slate-500">Подробно: реклама и все источники по шагам</summary>
            <div className="px-4 pb-4">
              <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-white/[.06]">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="bg-slate-50 text-[11.5px] text-slate-500 dark:bg-white/[.03]">
                <tr><th className="px-4 py-2.5 text-left font-medium">Шаг</th><th className="w-[26%] px-4 py-2.5 text-left font-medium">С рекламы</th><th className="w-[26%] px-4 py-2.5 text-left font-medium">Все источники</th></tr>
              </thead>
              <tbody>
                <Group title="На сайте" />
                {site.map((r) => <Line key={r.label} r={r} baseAd={ad?.visits} baseAll={all?.visits} />)}
                <Group title="В CRM" />
                {crmRows.map((r) => <Line key={r.label} r={r} baseAd={A.inq} baseAll={T.inq} />)}
              </tbody>
            </table>
          </div>
            </div>
          </details>
          <p className="text-[11.5px] leading-5 text-slate-400">«С рекламы» в CRM — заявки с форм сайта, где сохранился клик Директа или рекламная метка. Кто перешёл с рекламы в Telegram, Метрика не передаёт — такие люди видны на сайте в строке «Написали», а в CRM попадают во «Все источники».{f.missingGoals.length ? ` Не нашла в Метрике цели: ${f.missingGoals.join(", ")}.` : ""}</p>
          {f.configured && (
            <details className="rounded-xl border border-slate-100 dark:border-white/[.06]">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-[12.5px] text-slate-500"><Settings2 className="h-3.5 w-3.5" />Настройки Метрики и расхода</summary>
              <div className="px-4 pb-4"><MetrikaSetup configured counterId={s.counterId} month={month} spend={manualAdSpend(month)} /></div>
            </details>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-white/[.06]">
          <h2 className="text-[15px] font-semibold">Откуда обращения</h2>
          <div className="ml-auto flex gap-3 text-[11.5px] text-slate-500"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />оплатили</span><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-300 dark:bg-emerald-700" />в работе</span><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-200 dark:bg-white/[.12]" />остальные</span></div>
        </div>
        <div className="space-y-3 p-5">
          {sources.map((x) => {
            const w = (v: number) => `${(v / Math.max(1, ...sources.map((x) => x.inq))) * 100}%`;
            const workOnly = Math.max(0, x.work - x.paid);
            return (
              <div key={x.k} className="grid grid-cols-[130px_1fr_auto] items-center gap-3 text-[13px] sm:grid-cols-[160px_1fr_220px]" title={`${x.k}: обращений ${x.inq}, в работе ${x.work}, оплатили ${x.paid}, получено ${rub(x.revenue)}`}>
                <span className="truncate font-medium">{x.k}</span>
                <div className="flex h-5 items-center">
                  <div className="flex h-full gap-[2px]" style={{ width: w(x.inq) }}>
                    {x.paid > 0 && <div className="h-full rounded-l-[4px] bg-emerald-600" style={{ flex: x.paid }} />}
                    {workOnly > 0 && <div className={`h-full bg-emerald-300 dark:bg-emerald-700 ${x.paid ? "" : "rounded-l-[4px]"}`} style={{ flex: workOnly }} />}
                    {x.inq - x.work > 0 && <div className={`h-full rounded-r-[4px] bg-slate-200 dark:bg-white/[.12] ${x.work ? "" : "rounded-l-[4px]"}`} style={{ flex: x.inq - Math.max(x.work, x.paid) }} />}
                  </div>
                </div>
                <span className="text-right tabular-nums text-slate-500"><b className="font-semibold text-slate-900 dark:text-white">{x.inq}</b> · оплатили {x.paid} ({pct(x.paid, x.inq)}) · {rub(x.revenue)}</span>
              </div>
            );
          })}
          {!sources.length && <div className="py-6 text-center text-[13px] text-slate-400">В этом месяце обращений нет.</div>}
        </div>
      </section>
    </div>
  );
}

function Group({ title }: { title: string }) {
  return <tr className="border-t border-slate-100 bg-slate-50/50 dark:border-white/[.06] dark:bg-white/[.02]"><td colSpan={3} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</td></tr>;
}

function Line({ r, baseAd, baseAll }: { r: Row; baseAd?: number | null; baseAll?: number | null }) {
  const cell = (v: number | null, base?: number | null) => (
    <td className="px-4 py-2.5">
      <span className="text-[15px] font-semibold tabular-nums">{v === null ? "—" : r.money ? rub(v) : n(v)}</span>
      {r.base && v !== null && base ? <span className="ml-2 text-[12px] font-medium text-violet-600">{pct(v, base)}</span> : null}
    </td>
  );
  return (
    <tr className="border-t border-slate-100 dark:border-white/[.06]">
      <td className="px-4 py-2.5"><div className="font-medium">{r.label}</div><div className="text-[11.5px] text-slate-400">{r.hint}</div></td>
      {cell(r.ad, baseAd)}{cell(r.all, baseAll)}
    </tr>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-white/[.04]"><div className="text-[12px] text-slate-500">{label}</div><div className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums">{value}</div><div className="mt-0.5 truncate text-[11.5px] text-slate-400" title={hint}>{hint}</div></div>;
}

function Step({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "ad" | "money" }) {
  const ring = tone === "ad" ? "border-violet-200 bg-violet-50/60 dark:border-violet-500/25 dark:bg-violet-500/[.07]" : tone === "money" ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/25 dark:bg-emerald-500/[.07]" : "border-slate-200/80 bg-white dark:border-white/[.08] dark:bg-transparent";
  return (
    <div className={`min-w-0 flex-1 rounded-xl border px-4 py-3 ${ring}`}>
      <div className="text-[12px] text-slate-500">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-0.5 truncate text-[11.5px] text-slate-400" title={sub}>{sub}</div>
    </div>
  );
}

function Arrow({ v, gap }: { v: string | null; gap?: boolean }) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-1 text-[12px] font-semibold text-violet-700 dark:text-violet-300 lg:w-12 lg:flex-col">
      {gap ? <span className="text-[10.5px] font-normal text-slate-400 lg:text-center">сайт → CRM</span> : <ChevronRight className="h-4 w-4 rotate-90 text-slate-300 lg:rotate-0" />}
      {v && <span>{v}</span>}
    </div>
  );
}
