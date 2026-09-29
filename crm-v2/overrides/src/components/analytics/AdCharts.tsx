"use client";

import { useState } from "react";

type Day = { date: string; visits: number; messengers: number; leads: number; orders: number; cost: number | null };

const n = (v: number) => new Intl.NumberFormat("ru-RU").format(Math.round(v));
const dm = (d: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const weekend = (d: string) => { const w = new Date(`${d}T12:00:00Z`).getUTCDay(); return w === 0 || w === 6; };

// Категориальные цвета (проверенная палитра, первые 3 слота) + один оттенок для расхода.
const SERIES = [
  { key: "messengers", label: "Написали / позвонили", cls: "bg-[#2a78d6] dark:bg-[#3987e5]" },
  { key: "leads", label: "Заявка с формы", cls: "bg-[#eb6834] dark:bg-[#d95926]" },
  { key: "orders", label: "Заказ", cls: "bg-[#1baf7a] dark:bg-[#199e70]" },
] as const;

/** Два графика по дням: расход Директа и действия с рекламы. Одна ось X, наведение — подсказка. */
export function AdCharts({ daily }: { daily: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!daily.length) return null;
  const hasCost = daily.some((d) => (d.cost || 0) > 0);
  const maxCost = Math.max(1, ...daily.map((d) => d.cost || 0));
  const maxAct = Math.max(1, ...daily.map((d) => d.messengers + d.leads + d.orders));
  const h = hover != null ? daily[hover] : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2" onMouseLeave={() => setHover(null)}>
      {hasCost && (
        <Panel title="Расход на Директ по дням" note={h ? `${dm(h.date)}: ${n(h.cost || 0)} ₽` : `всего ${n(daily.reduce((s, d) => s + (d.cost || 0), 0))} ₽`}>
          <div className="flex h-36 items-end gap-[2px]">
            {daily.map((d, i) => (
              <div key={d.date} onMouseEnter={() => setHover(i)} className="flex h-full min-w-0 flex-1 cursor-default items-end">
                <div className={`w-full rounded-t-[4px] ${hover === i ? "bg-violet-700 dark:bg-violet-300" : "bg-violet-500 dark:bg-violet-400"}`} style={{ height: `${Math.max(d.cost ? 2 : 0, ((d.cost || 0) / maxCost) * 100)}%` }} />
              </div>
            ))}
          </div>
          <Axis daily={daily} />
        </Panel>
      )}
      <Panel title="Что делали люди с рекламы" note={h ? `${dm(h.date)}: визитов ${n(h.visits)} · написали ${h.messengers} · заявок ${h.leads} · заказов ${h.orders}` : `визитов ${n(daily.reduce((s, d) => s + d.visits, 0))}`}>
        <div className="flex h-36 items-end gap-[2px]">
          {daily.map((d, i) => {
            const total = d.messengers + d.leads + d.orders;
            return (
              <div key={d.date} onMouseEnter={() => setHover(i)} className={`flex h-full min-w-0 flex-1 cursor-default flex-col justify-end ${hover === i ? "bg-slate-100/70 dark:bg-white/[.04]" : ""}`}>
                <div className="flex flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]" style={{ height: `${(total / maxAct) * 100}%` }}>
                  {SERIES.map((s) => d[s.key] > 0 && <div key={s.key} className={s.cls} style={{ flex: d[s.key] }} />)}
                </div>
                {total === 0 && <div className="h-[2px] w-full rounded bg-slate-100 dark:bg-white/[.06]" />}
              </div>
            );
          })}
        </div>
        <Axis daily={daily} />
        <div className="mt-2 flex flex-wrap gap-3 text-[11.5px] text-slate-500">
          {SERIES.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${s.cls}`} />{s.label} {n(daily.reduce((x, d) => x + d[s.key], 0))}</span>)}
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 p-4 dark:border-white/[.06]">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><span className="text-[13px] font-semibold">{title}</span><span className="text-[12px] tabular-nums text-slate-500">{note}</span></div>
      {children}
    </div>
  );
}

function Axis({ daily }: { daily: Day[] }) {
  return (
    <div className="mt-1 flex gap-[2px] text-center text-[10px] tabular-nums text-slate-400">
      {daily.map((d, i) => <div key={d.date} className={`min-w-0 flex-1 ${weekend(d.date) ? "text-slate-300 dark:text-slate-600" : ""}`}>{daily.length > 20 && i % 2 ? "" : Number(d.date.slice(8))}</div>)}
    </div>
  );
}
