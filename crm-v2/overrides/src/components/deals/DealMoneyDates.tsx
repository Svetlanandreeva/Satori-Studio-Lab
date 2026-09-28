"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";

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
const field = "mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 dark:border-white/[.1] dark:bg-transparent dark:text-white";
const label = "text-[12px] font-medium text-slate-500";

/** Главный блок карточки: деньги, дата оплаты (= старт работ), срок и дедлайн. */
export function DealMoneyDates({ dealId, value, received, schedule, ownerId, members, costs }: {
  dealId: string; value: number; received: number; schedule: ScheduleView; ownerId: string | null; members: Member[];
  costs: { procurement: number; profit: number };
}) {
  const router = useRouter();
  const initial = useMemo(() => ({
    value: toRub(value), received: toRub(received), paidAt: schedule.paidAt || "", term: schedule.termDays ? String(schedule.termDays) : "", owner: ownerId || "",
  }), [value, received, schedule.paidAt, schedule.termDays, ownerId]);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const term = Number(form.term) || 0;
  const deadline = form.paidAt && term > 0 ? addDays(form.paidAt, term) : (!form.paidAt && !term ? schedule.deadline : null);
  const badge = deadlineBadge(deadline, schedule.shippedAt);
  const paidPct = toKop(form.value) ? Math.min(100, Math.round((toKop(form.received) / toKop(form.value)) * 100)) : 0;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (form.term && (!Number.isFinite(term) || term < 1 || term > 365)) { toast.error("Срок — от 1 до 365 дней"); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: toKop(form.value), receivedAmount: toKop(form.received), paidAt: form.paidAt || null, termDays: form.term ? term : null, ownerId: form.owner || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Не удалось сохранить");
      toast.success("Сохранено");
      router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Ошибка сохранения"); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
      {/* Сроки — главное */}
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1.3fr]">
        <label className={label}>Дата оплаты · старт работ
          <div className="flex gap-1.5">
            <input type="date" value={form.paidAt} onChange={set("paidAt")} className={field} />
            {!form.paidAt && <button type="button" onClick={() => setForm((f) => ({ ...f, paidAt: today() }))} className="mt-1.5 shrink-0 rounded-lg border border-slate-200 px-2.5 text-[12px] text-slate-600 hover:bg-slate-50 dark:border-white/[.1] dark:text-slate-300">Сегодня</button>}
          </div>
        </label>
        <label className={label}>Срок изготовления, дней
          <input type="number" min={1} max={365} inputMode="numeric" value={form.term} onChange={set("term")} placeholder="Например, 14" className={field} />
          <div className="mt-1.5 flex gap-1">
            {TERM_PRESETS.map((d) => <button key={d} type="button" onClick={() => setForm((f) => ({ ...f, term: String(d) }))} className={`rounded-md px-2 py-0.5 text-[11px] ${form.term === String(d) ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-500 hover:text-slate-900 dark:bg-white/[.06]"}`}>{d}</button>)}
          </div>
        </label>
        <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-white/[.04]">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500"><CalendarClock className="h-3.5 w-3.5" />Дедлайн</div>
          {deadline ? (
            <>
              <div className="mt-1 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{human(deadline)}</div>
              {badge && <span className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ${toneClass[badge.tone]}`}>{badge.text}</span>}
            </>
          ) : (
            <div className="mt-1 text-[13px] leading-5 text-slate-400">Поставь дату оплаты и срок — дедлайн посчитается сам</div>
          )}
        </div>
      </div>

      <div className="my-5 h-px bg-slate-100 dark:bg-white/[.06]" />

      {/* Деньги */}
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1.3fr]">
        <label className={label}>Сумма сделки, ₽
          <input inputMode="decimal" value={form.value} onChange={set("value")} placeholder="0" className={field} />
        </label>
        <label className={label}>Получено от клиента, ₽
          <input inputMode="decimal" value={form.received} onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, received: v, paidAt: f.paidAt || (toKop(v) > 0 ? today() : "") })); }} placeholder="0" className={field} />
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[.06]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${paidPct}%` }} /></div>
          <div className="mt-1 text-[11px] text-slate-400">{paidPct ? `оплачено ${paidPct}%` : "оплат нет"}</div>
        </label>
        <div className="grid grid-cols-2 gap-3 self-start rounded-xl border border-slate-100 px-4 py-3 text-[12px] dark:border-white/[.06]">
          <div><div className="text-slate-400">Закупки</div><div className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">{money(costs.procurement)}</div></div>
          <div><div className="text-slate-400">Прибыль</div><div className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">{money(costs.profit)}</div></div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className={`${label} min-w-[200px]`}>Ответственный
          <select value={form.owner} onChange={set("owner")} className={field}>
            <option value="">Не назначен</option>
            {members.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <button type="button" onClick={() => setForm(initial)} disabled={busy} className="h-10 rounded-lg px-3 text-sm text-slate-500 hover:text-slate-900">Отменить</button>}
          <button type="button" onClick={() => void save()} disabled={busy || !dirty} className="h-10 rounded-lg bg-slate-950 px-5 text-sm font-medium text-white transition disabled:opacity-30 dark:bg-white dark:text-slate-950">{busy ? "Сохраняю…" : "Сохранить"}</button>
        </div>
      </div>
    </section>
  );
}
