"use client";

import { useMemo, useRef, useState } from "react";
import { autosaveLabel, useAutosave } from "@/lib/use-autosave";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Loader2 } from "lucide-react";

type Member = { id: string; name: string; active: boolean };
export type ScheduleView = { paidAt: string | null; termDays: number | null; deadline: string | null; shippedAt: string | null };

const TERM_PRESETS = [7, 14, 21, 30];

function toRub(kop: number) { const v = (Number(kop) || 0) / 100; return v ? String(v) : ""; }
function toKop(v: string) { return Math.max(0, Math.round((Number(v.replace(/\s/g, "").replace(",", ".")) || 0) * 100)); }
const money = (kop: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format((Number(kop) || 0) / 100);

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yekaterinburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
function diff(from: string, to: string) { return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000); }
function human(date: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "short" }).format(new Date(`${date}T12:00:00Z`));
}
function plural(n: number) { const a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return "дней"; if (b === 1) return "день"; if (b >= 2 && b <= 4) return "дня"; return "дней"; }

export function deadlineBadge(deadline: string | null, shippedAt: string | null) {
  if (!deadline) return null;
  if (shippedAt) {
    const late = diff(deadline, shippedAt);
    return late > 0 ? { text: `Отправлено с опозданием на ${late} ${plural(late)}`, tone: "amber" as const } : { text: "Отправлено в срок", tone: "green" as const };
  }
  const left = diff(today(), deadline);
  if (left < 0) return { text: `Просрочено на ${-left} ${plural(-left)}`, tone: "red" as const };
  if (left === 0) return { text: "Дедлайн сегодня", tone: "red" as const };
  if (left <= 2) return { text: `Осталось ${left} ${plural(left)}`, tone: "amber" as const };
  return { text: `Осталось ${left} ${plural(left)}`, tone: "green" as const };
}

const toneClass = { red: "bg-rose-50 text-rose-700 ring-rose-200", amber: "bg-amber-50 text-amber-800 ring-amber-200", green: "bg-emerald-50 text-emerald-700 ring-emerald-200" };

/** Главный блок карточки: деньги, дата оплаты (= старт работ), срок и дедлайн. */
export function DealMoneyDates({ dealId, value, received, schedule, ownerId, members, costs, access = "full" }: {
  dealId: string; value: number; received: number; schedule: ScheduleView; ownerId: string | null; members: Member[];
  costs: { procurement: number; profit: number };
  /** full — владелец; own — менеджер, своя сделка (без закупок и прибыли); none — сделка коллеги (сумм не видно). */
  access?: "full" | "own" | "none";
}) {
  const router = useRouter();
  const initial = useMemo(() => ({
    value: toRub(value), received: toRub(received), paidAt: schedule.paidAt || "", term: schedule.termDays ? String(schedule.termDays) : "", owner: ownerId || "",
  }), [value, received, schedule.paidAt, schedule.termDays, ownerId]);
  const [form, setForm] = useState(initial);
  // Что уже лежит на сервере — от этого считаем «есть несохранённое».
  const [savedSnapshot, setSavedSnapshot] = useState(initial);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const term = Number(form.term) || 0;
  const termInvalid = Boolean(form.term) && (!Number.isFinite(term) || term < 1 || term > 365);
  const dirty = !termInvalid && JSON.stringify(form) !== JSON.stringify(savedSnapshot);

  const deadline = form.paidAt && term > 0 ? addDays(form.paidAt, term) : (!form.paidAt && !term ? schedule.deadline : null);
  const badge = deadlineBadge(deadline, schedule.shippedAt);
  const paidPct = toKop(form.value) ? Math.min(100, Math.round((toKop(form.received) / toKop(form.value)) * 100)) : 0;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const autosave = useAutosave(form, dirty, async (f, { keepalive }) => {
    const t = Number(f.term) || 0;
    const res = await fetch(`/api/deals/${dealId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, keepalive,
      body: JSON.stringify({ ...(access === "none" ? {} : { value: toKop(f.value), receivedAmount: toKop(f.received) }), paidAt: f.paidAt || null, termDays: f.term ? t : null, ownerId: f.owner || null }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "ошибка сервера");
    setSavedSnapshot(f);
    // Остальные блоки страницы (этап, прибыль, производство) обновим чуть позже, чтобы не мешать вводу.
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 1500);
  });
  const saveState = termInvalid ? { text: "Срок — от 1 до 365 дней", tone: "text-rose-600" } : autosaveLabel(autosave.status, autosave.error);

  const profitTone = costs.profit < 0 ? "text-rose-600" : "text-emerald-700";
  const inputCls = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[14px] text-slate-900 outline-none focus:border-slate-400 dark:border-white/[.1] dark:bg-transparent dark:text-white";
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
      {/* Сроки */}
      <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-[1fr_1fr_1.2fr] sm:items-end dark:border-white/[.06]">
        <label className="text-[12px] text-slate-500">Оплата · старт работ
          <div className="mt-1 flex gap-1.5">
            <input type="date" value={form.paidAt} onChange={set("paidAt")} className={inputCls} />
            {!form.paidAt && <button type="button" onClick={() => setForm((f) => ({ ...f, paidAt: today() }))} className="h-9 shrink-0 rounded-lg border border-slate-200 px-2.5 text-[12px] text-slate-600 hover:bg-slate-50 dark:border-white/[.1] dark:text-slate-300">Сегодня</button>}
          </div>
        </label>
        <label className="text-[12px] text-slate-500">Срок, дней
          <div className="mt-1 flex items-center gap-1">
            <input type="number" min={1} max={365} inputMode="numeric" value={form.term} onChange={set("term")} placeholder="14" className={`${inputCls} w-20`} />
            {TERM_PRESETS.map((d) => <button key={d} type="button" onClick={() => setForm((f) => ({ ...f, term: String(d) }))} className={`h-7 rounded-md px-1.5 text-[11.5px] ${form.term === String(d) ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/[.06]"}`}>{d}</button>)}
          </div>
        </label>
        <div className="rounded-xl bg-slate-50 px-3.5 py-2 dark:bg-white/[.04]">
          <div className="flex items-center gap-1.5 text-[11.5px] text-slate-500"><CalendarClock className="h-3.5 w-3.5" />Дедлайн</div>
          {deadline ? (
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[16px] font-semibold tracking-tight">{human(deadline)}</span>
              {badge && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${toneClass[badge.tone]}`}>{badge.text}</span>}
            </div>
          ) : <div className="text-[12.5px] text-slate-400">появится после оплаты и срока</div>}
        </div>
      </div>

      {/* Деньги */}
      {access === "none" ? (
        <div className="px-5 py-4 text-[13px] text-slate-500">Суммы по этой сделке видит ответственный. Сроки и этапы можно вести.</div>
      ) : (
      <div className="grid gap-3 p-5 sm:grid-cols-[1fr_1fr_1.2fr] sm:items-end">
        <label className="text-[12px] text-slate-500">Сумма сделки, ₽
          <input inputMode="decimal" value={form.value} onChange={set("value")} placeholder="0" className={`${inputCls} mt-1`} />
        </label>
        <label className="text-[12px] text-slate-500">Получено, ₽ <span className="text-slate-400">{paidPct ? `· ${paidPct}%` : ""}</span>
          <input inputMode="decimal" value={form.received} onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, received: v, paidAt: f.paidAt || (toKop(v) > 0 ? today() : "") })); }} placeholder="0" className={`${inputCls} mt-1`} />
        </label>
        {access === "full" ? (
          <div className="flex items-end justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2 text-[12px] dark:bg-white/[.04]">
            <div><div className="text-slate-500">Закупки</div><div className="text-[14px] font-semibold tabular-nums">{money(costs.procurement)}</div></div>
            <div className="text-right"><div className="text-slate-500">Прибыль</div><div className={`text-[14px] font-semibold tabular-nums ${profitTone}`}>{money(costs.profit)}</div></div>
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 px-3.5 py-2 text-[12px] dark:bg-white/[.04]"><div className="text-slate-500">Осталось получить</div><div className="text-[14px] font-semibold tabular-nums">{money(Math.max(0, toKop(form.value) - toKop(form.received)))}</div></div>
        )}
      </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-2.5 dark:border-white/[.06]">
        <label className="flex items-center gap-2 text-[12px] text-slate-500">Ответственный
          <select value={form.owner} onChange={set("owner")} className="h-8 rounded-lg border border-slate-200 bg-transparent px-2 text-[13px] text-slate-800 outline-none dark:border-white/[.1] dark:text-slate-200">
            <option value="">не назначен</option>
            {members.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <div className={`ml-auto flex items-center gap-1.5 text-[12px] ${saveState.tone}`}>
          {autosave.status === "saving" || autosave.status === "pending" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : autosave.status === "saved" ? <Check className="h-3.5 w-3.5" /> : null}
          {saveState.text}
          {autosave.status === "error" && <button type="button" onClick={() => void autosave.flush()} className="ml-1 font-medium underline">Повторить</button>}
        </div>
      </div>
    </section>
  );
}
