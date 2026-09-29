import { Settings2 } from "lucide-react";
import { adFunnel, manualAdSpend, metrikaSettings } from "@/lib/metrika";
import { monthInquiries, type Inquiry } from "@/lib/inquiries";
import { MetrikaSetup } from "@/components/analytics/MetrikaSetup";

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
            <Kpi label="Расход на рекламу" value={f.cost != null ? rub(f.cost) : "—"} hint={f.costSource === "direct" ? "из Директа" : f.costSource === "manual" ? "введено вручную" : "впиши в настройках ниже"} />
            <Kpi label="Цена действия с рекламы" value={f.cost && adActions ? rub(f.cost / adActions) : "—"} hint={`${n(adActions)}: написали, заявки, заказы`} />
            <Kpi label="Получено за месяц" value={rub(T.revenue)} hint={`${T.paid} оплат · с рекламы ${rub(A.revenue)}`} />
            <Kpi label="Доля рекламы в выручке" value={f.cost && T.revenue ? pct(f.cost, T.revenue) : "—"} hint="расход ÷ все деньги месяца (ДРР)" />
          </div>

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
        <div className="border-b border-slate-100 px-5 py-3.5 dark:border-white/[.06]"><h2 className="text-[15px] font-semibold">Источники за месяц</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="text-[11.5px] text-slate-500"><tr className="border-b border-slate-100 dark:border-white/[.06]"><th className="px-5 py-2.5 text-left font-medium">Источник</th><th className="px-4 py-2.5 text-right font-medium">Обращения</th><th className="px-4 py-2.5 text-right font-medium">В работе</th><th className="px-4 py-2.5 text-right font-medium">Оплатили</th><th className="px-4 py-2.5 text-right font-medium">Конверсия</th><th className="px-5 py-2.5 text-right font-medium">Получено</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[.06]">
              {sources.map((x) => <tr key={x.k}><td className="px-5 py-2.5 font-medium">{x.k}</td><td className="px-4 py-2.5 text-right tabular-nums">{x.inq}</td><td className="px-4 py-2.5 text-right tabular-nums">{x.work}</td><td className="px-4 py-2.5 text-right tabular-nums">{x.paid}</td><td className="px-4 py-2.5 text-right tabular-nums text-violet-700">{pct(x.paid, x.inq)}</td><td className="px-5 py-2.5 text-right tabular-nums">{rub(x.revenue)}</td></tr>)}
            </tbody>
          </table>
          {!sources.length && <div className="p-8 text-center text-[13px] text-slate-400">В этом месяце обращений нет.</div>}
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
