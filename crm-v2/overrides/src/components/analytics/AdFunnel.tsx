import Link from "next/link";
import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { adFunnel, manualAdSpend, metrikaSettings } from "@/lib/metrika";
import { monthInquiries } from "@/lib/inquiries";
import { MetrikaSetup } from "@/components/analytics/MetrikaSetup";

const n = (v: number) => new Intl.NumberFormat("ru-RU").format(Math.round(v));
const rub = (v: number) => `${n(v)} ₽`;
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString("ru-RU", { maximumFractionDigits: a / b < 0.1 ? 1 : 0 })}%` : "—");
function shift(m: string, d: number) { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + d, 1)).toISOString().slice(0, 7); }

/** Реклама → сайт → сообщение/заявка → CRM → оплата. */
export async function AdFunnel({ month, basePath = "/analytics" }: { month: string; basePath?: string }) {
  const [f, inq] = [await adFunnel(month), monthInquiries(month)];
  const s = metrikaSettings();
  const title = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T00:00:00Z`));
  const ad = f.ad;
  const adActions = ad ? ad.messengers + ad.leads + ad.orders : 0;
  const crm = { inquiries: inq.length, work: inq.filter((i) => i.status === "work").length, paid: inq.filter((i) => i.paid).length };
  const steps = [
    { label: "Пришли с рекламы", value: ad?.visits ?? null, hint: f.all ? `из ${n(f.all.visits)} визитов на сайт` : "визиты на сайт" },
    { label: "Написали или позвонили", value: ad ? ad.messengers : null, hint: "клик в Telegram, WhatsApp, телефон", from: ad?.visits },
    { label: "Заявка на сайте", value: ad ? ad.leads : null, hint: "форма «На заказ» / «Бизнесу»", from: ad?.visits },
    { label: "Заказ в магазине", value: ad ? ad.orders : null, hint: "оформили или быстрый заказ", from: ad?.visits },
  ];
  const crmSteps = [
    { label: "Обращений в CRM", value: crm.inquiries, hint: "все каналы, люди написали сами" },
    { label: "Взято в работу", value: crm.work, hint: pct(crm.work, crm.inquiries) + " от обращений" },
    { label: "Оплатили", value: crm.paid, hint: pct(crm.paid, crm.inquiries) + " от обращений" },
  ];
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-white/[.06]">
        <h2 className="text-[15px] font-semibold">Реклама → заявки</h2>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5 text-[13px] dark:border-white/[.1]">
          <Link href={`${basePath}?m=${shift(month, -1)}`} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Предыдущий месяц"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-[110px] text-center capitalize">{title}</span>
          <Link href={`${basePath}?m=${shift(month, 1)}`} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Следующий месяц"><ChevronRight className="h-4 w-4" /></Link>
        </div>
        <span className="ml-auto text-[12px] text-slate-400">Яндекс Директ · Метрика {s.counterId}</span>
      </div>

      {!f.configured ? (
        <div className="space-y-4 p-5">
          <p className="text-[13px] leading-5 text-slate-600 dark:text-slate-300">Подключи Метрику — тогда здесь будет видно, сколько людей пришло с рекламы и сколько из них написали, оставили заявку и заказали. Цели на сайте уже настроены: клики в Telegram/WhatsApp/телефон, формы и заказы.</p>
          <MetrikaSetup configured={false} counterId={s.counterId} month={month} spend={manualAdSpend(month)} />
        </div>
      ) : (
        <div className="space-y-5 p-5">
          {f.error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">Метрика: {f.error}</div>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Расход" value={f.cost != null ? rub(f.cost) : "—"} hint={f.costSource === "direct" ? "из Директа" : f.costSource === "manual" ? "введено вручную" : "не задан"} />
            <Kpi label="Цена обращения с рекламы" value={f.cost && adActions ? rub(f.cost / adActions) : "—"} hint={`${n(adActions)} действий: сообщения, заявки, заказы`} />
            <Kpi label="Конверсия рекламы" value={ad ? pct(adActions, ad.visits) : "—"} hint="визит → написал / заявка / заказ" />
            <Kpi label="Цена оплаченного заказа" value={f.cost && crm.paid ? rub(f.cost / crm.paid) : "—"} hint="расход ÷ оплатившие обращения месяца" />
          </div>

          <div>
            <div className="mb-2 text-[12px] font-medium text-slate-500">На сайте (только реклама)</div>
            <Steps steps={steps} />
          </div>
          <div>
            <div className="mb-2 text-[12px] font-medium text-slate-500">В CRM (все каналы за месяц)</div>
            <Steps steps={crmSteps.map((x, i) => ({ ...x, from: i ? crm.inquiries : undefined }))} />
          </div>
          <p className="text-[11.5px] leading-5 text-slate-400">Сайт и CRM связаны по сумме, а не по людям: кто именно из рекламы написал в Telegram, Метрика не знает. Для точной связки заказы с сайта уже передают yclid в Метрику (офлайн-конверсии «purchase»).{f.missingGoals.length ? ` Не нашла в Метрике цели: ${f.missingGoals.join(", ")}.` : ""}</p>
          <details className="rounded-xl border border-slate-100 dark:border-white/[.06]">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-[12.5px] text-slate-500"><Settings2 className="h-3.5 w-3.5" />Настройки Метрики и расхода</summary>
            <div className="px-4 pb-4"><MetrikaSetup configured counterId={s.counterId} month={month} spend={manualAdSpend(month)} /></div>
          </details>
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-white/[.04]"><div className="text-[12px] text-slate-500">{label}</div><div className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums">{value}</div><div className="mt-0.5 truncate text-[11.5px] text-slate-400" title={hint}>{hint}</div></div>;
}

function Steps({ steps }: { steps: Array<{ label: string; value: number | null; hint: string; from?: number }> }) {
  const max = Math.max(1, ...steps.map((s) => s.value || 0));
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s) => (
        <div key={s.label} className="rounded-xl border border-slate-100 px-4 py-3 dark:border-white/[.06]">
          <div className="flex items-baseline justify-between gap-2"><span className="text-[12.5px] text-slate-600 dark:text-slate-300">{s.label}</span>{s.from !== undefined && s.value !== null && <span className="text-[12px] font-medium text-violet-600">{pct(s.value, s.from || 0)}</span>}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{s.value === null ? "—" : n(s.value)}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[.06]"><div className="h-full rounded-full bg-violet-500" style={{ width: `${((s.value || 0) / max) * 100}%` }} /></div>
          <div className="mt-1.5 truncate text-[11.5px] text-slate-400" title={s.hint}>{s.hint}</div>
        </div>
      ))}
    </div>
  );
}
