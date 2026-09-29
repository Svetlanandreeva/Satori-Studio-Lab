"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const addD = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const monthOf = (d: string, delta = 0) => { const [y, m] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7); };
const lastDay = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };

/** Период Сводки: месяц стрелками или любой свой диапазон дат. */
export function PeriodPicker({ from, to, month, label, today, basePath = "/" }: {
  from: string; to: string; month: string | null; label: string; today: string; basePath?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setF(from); setT(to); }, [from, to]);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [open]);

  const range = (a: string, b: string) => `${basePath}?from=${a}&to=${b}`;
  const len = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const prev = month ? `${basePath}?m=${monthOf(`${month}-01`, -1)}` : range(addD(from, -len), addD(from, -1));
  const next = month ? `${basePath}?m=${monthOf(`${month}-01`, 1)}` : range(addD(to, 1), addD(to, len));
  const q = Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1;
  const qStart = `${today.slice(0, 4)}-${String(q).padStart(2, "0")}-01`;
  const presets: Array<[string, string]> = [
    ["Этот месяц", `${basePath}?m=${today.slice(0, 7)}`],
    ["Прошлый месяц", `${basePath}?m=${monthOf(today, -1)}`],
    ["Последние 7 дней", range(addD(today, -6), today)],
    ["Последние 30 дней", range(addD(today, -29), today)],
    ["Этот квартал", range(qStart, lastDay(monthOf(qStart, 2)))],
    ["С начала года", range(`${today.slice(0, 4)}-01-01`, today)],
  ];
  const go = (href: string) => { setOpen(false); router.push(href); };
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(f) && /^\d{4}-\d{2}-\d{2}$/.test(t) && f <= t;

  return (
    <div ref={box} className="relative flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm dark:border-white/[.08] dark:bg-[#16181d]">
      <Link href={prev} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[.06]" aria-label="Раньше"><ChevronLeft className="h-4 w-4" /></Link>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-[120px] items-center justify-center gap-1.5 rounded-lg px-2 py-0.5 font-medium hover:bg-slate-100 dark:hover:bg-white/[.06]">
        {!month && <CalendarRange className="h-3.5 w-3.5 text-slate-400" />}<span className="first-letter:uppercase">{label}</span><ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      <Link href={next} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[.06]" aria-label="Позже"><ChevronRight className="h-4 w-4" /></Link>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-[300px] rounded-xl border bg-white p-2 shadow-xl dark:border-white/[.1] dark:bg-[#1c1f25]">
          <div className="grid grid-cols-2 gap-1">
            {presets.map(([name, href]) => (
              <button key={name} type="button" onClick={() => go(href)} className="rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-slate-100 dark:hover:bg-white/[.06]">{name}</button>
            ))}
          </div>
          <div className="mt-2 border-t pt-2 dark:border-white/[.08]">
            <div className="px-1 pb-1.5 text-[12px] font-medium text-slate-500">Свой период</div>
            <div className="flex items-center gap-1.5">
              <input type="date" value={f} max={t || undefined} onChange={(e) => setF(e.target.value)} className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-transparent px-2 text-[13px] dark:border-white/[.1]" aria-label="С" />
              <span className="text-slate-400">—</span>
              <input type="date" value={t} min={f || undefined} onChange={(e) => setT(e.target.value)} className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-transparent px-2 text-[13px] dark:border-white/[.1]" aria-label="По" />
            </div>
            <button type="button" disabled={!valid} onClick={() => go(range(f, t))} className="mt-2 h-8 w-full rounded-lg bg-slate-900 text-[13px] font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">Показать</button>
          </div>
        </div>
      )}
    </div>
  );
}
