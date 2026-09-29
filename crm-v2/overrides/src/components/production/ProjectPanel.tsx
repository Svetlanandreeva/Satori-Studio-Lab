"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { deadlineBadge } from "@/components/deals/DealMoneyDates";

type Purchase = { id: string; name: string; quantity: number; unit: string; unitCost: number; plannedUnitCost: number; totalCost: number; status: string; supplier: string | null };
type Costs = { receivedAmount: number; productionCost: number; deliveryCost: number; packagingCost: number; contractorCost: number; paymentCommission: number; taxCost: number; otherCost: number };
type Data = {
  deal: { id: string; title: string; value: number; contactId: string; contactName: string; stageName: string };
  schedule: { paidAt: string | null; termDays: number | null; deadline: string | null; shippedAt: string | null };
  purchases: Purchase[];
  procurement: { actualTotal: number };
  costs: Costs;
  finance: { directCost: number; profit: number; margin: number; managerCommission: number };
};

const money = (kop: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format((Number(kop) || 0) / 100);
const toKop = (v: string) => Math.max(0, Math.round((Number(String(v).replace(/\s/g, "").replace(",", ".")) || 0) * 100));
const toRub = (kop: number) => { const v = (Number(kop) || 0) / 100; return v ? String(v) : ""; };
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const longDate = (d: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "short" }).format(new Date(`${d}T12:00:00Z`));
const input = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] outline-none focus:border-slate-400 dark:border-white/[.1] dark:bg-transparent";
const toneClass = { red: "bg-rose-50 text-rose-700", amber: "bg-amber-50 text-amber-800", green: "bg-emerald-50 text-emerald-700" };

const COSTS: Array<[keyof Costs, string]> = [
  ["productionCost", "Работа / печать"],
  ["deliveryCost", "Доставка"],
  ["packagingCost", "Упаковка"],
  ["contractorCost", "Подрядчики"],
  ["paymentCommission", "Комиссия за оплату"],
  ["taxCost", "Налог"],
  ["otherCost", "Прочее"],
];

/** Панель проекта: сроки, материалы, прочие расходы и итоговая экономика — в одном месте. */
export function ProjectPanel({ dealId, onClose, onChanged }: { dealId: string | null; onClose: () => void; onChanged?: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [dates, setDates] = useState({ paidAt: "", term: "" });
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [row, setRow] = useState({ name: "", quantity: "1", unit: "шт.", price: "" });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dealId) return;
    const res = await fetch(`/api/production/project?dealId=${encodeURIComponent(dealId)}`, { cache: "no-store" });
    const d = await res.json();
    if (!res.ok) { toast.error(d.error || "Не удалось открыть проект"); return; }
    setData(d);
    setDates({ paidAt: d.schedule.paidAt || "", term: d.schedule.termDays ? String(d.schedule.termDays) : "" });
    setCosts(Object.fromEntries([...COSTS.map(([k]) => [k, toRub(d.costs[k])]), ["receivedAmount", toRub(d.costs.receivedAmount)]]));
  }, [dealId]);

  useEffect(() => { setData(null); setRow({ name: "", quantity: "1", unit: "шт.", price: "" }); void load(); }, [load]);

  async function saveDates() {
    if (!data) return;
    const term = Number(dates.term) || 0;
    if (dates.term && (term < 1 || term > 365)) return toast.error("Срок — от 1 до 365 дней");
    setBusy("dates");
    try {
      const res = await fetch(`/api/deals/${data.deal.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paidAt: dates.paidAt || null, termDays: dates.term ? term : null }) });
      if (!res.ok) throw new Error((await res.json()).error || "Не удалось сохранить");
      toast.success("Сроки сохранены"); await load(); onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); } finally { setBusy(null); }
  }

  async function addPurchase() {
    if (!data || !row.name.trim()) return toast.error("Напиши, что за материал");
    setBusy("add");
    try {
      const price = toKop(row.price);
      const res = await fetch("/api/procurement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId: data.deal.id, name: row.name.trim(), quantity: Number(String(row.quantity).replace(",", ".")) || 1, unit: row.unit || "шт.", unitCost: price, plannedUnitCost: price, status: "paid" }) });
      if (!res.ok) throw new Error((await res.json()).error || "Не удалось добавить");
      setRow({ name: "", quantity: "1", unit: row.unit || "шт.", price: "" }); await load(); onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); } finally { setBusy(null); }
  }

  async function removePurchase(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/procurement?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Не удалось удалить");
      await load(); onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); } finally { setBusy(null); }
  }

  async function saveCosts() {
    if (!data) return;
    setBusy("costs");
    try {
      const body: Record<string, unknown> = { dealId: data.deal.id };
      for (const [k] of COSTS) body[k] = toKop(costs[k] || "");
      body.receivedAmount = toKop(costs.receivedAmount || "");
      const res = await fetch("/api/production/project", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Не удалось сохранить");
      setData(d); toast.success("Расходы сохранены"); onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); } finally { setBusy(null); }
  }

  const term = Number(dates.term) || 0;
  const deadline = dates.paidAt && term ? addDays(dates.paidAt, term) : data?.schedule.deadline || null;
  const badge = deadlineBadge(deadline, data?.schedule.shippedAt || null);
  const datesDirty = data && (dates.paidAt !== (data.schedule.paidAt || "") || dates.term !== (data.schedule.termDays ? String(data.schedule.termDays) : ""));
  const costsDirty = data && [...COSTS.map(([k]) => k), "receivedAmount" as const].some((k) => toKop(costs[k] || "") !== (data.costs as Record<string, number>)[k]);

  return (
    <Sheet open={Boolean(dealId)} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[720px]">
        {!data ? (
          <div className="flex h-full items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Загрузка…</div>
        ) : (
          <div className="space-y-5 p-5 sm:p-6">
            <div className="pr-8">
              <SheetTitle className="text-xl font-semibold tracking-tight">{data.deal.title}</SheetTitle>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                <span>{data.deal.contactName}</span><span>· {data.deal.stageName}</span>
                <Link href={`/deals/${data.deal.id}`} className="inline-flex items-center gap-1 text-slate-700 hover:underline dark:text-slate-300">Карточка сделки <ExternalLink className="h-3.5 w-3.5" /></Link>
              </div>
            </div>

            {/* Сроки */}
            <section className="rounded-xl border border-slate-200 p-4 dark:border-white/[.08]">
              <h3 className="mb-3 text-sm font-semibold">Сроки</h3>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.3fr] sm:items-end">
                <label className="text-[12px] text-slate-500">Дата оплаты · старт<input type="date" value={dates.paidAt} onChange={(e) => setDates((d) => ({ ...d, paidAt: e.target.value }))} className={`${input} mt-1`} /></label>
                <label className="text-[12px] text-slate-500">Срок, дней<input type="number" min={1} max={365} value={dates.term} onChange={(e) => setDates((d) => ({ ...d, term: e.target.value }))} placeholder="14" className={`${input} mt-1`} /></label>
                <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/[.04]">
                  <div className="text-[11px] text-slate-500">Дедлайн</div>
                  {deadline ? <><div className="text-[15px] font-semibold">{longDate(deadline)}</div>{badge && <span className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${toneClass[badge.tone]}`}>{badge.text}</span>}</> : <div className="text-[12px] text-slate-400">укажи оплату и срок</div>}
                </div>
              </div>
              {datesDirty && <div className="mt-3 flex justify-end"><button onClick={() => void saveDates()} disabled={busy === "dates"} className="h-9 rounded-lg bg-slate-950 px-4 text-[13px] font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-950">{busy === "dates" ? "Сохраняю…" : "Сохранить сроки"}</button></div>}
            </section>

            {/* Материалы */}
            <section className="rounded-xl border border-slate-200 p-4 dark:border-white/[.08]">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Материалы</h3><span className="text-[13px] font-semibold tabular-nums">{money(data.procurement.actualTotal)}</span></div>
              {data.purchases.length > 0 && (
                <div className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-100 dark:divide-white/[.06] dark:border-white/[.06]">
                  {data.purchases.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                      <div className="min-w-0 flex-1 truncate">{p.name}</div>
                      <div className="shrink-0 text-slate-500">{p.quantity} {p.unit} × {money(p.unitCost || p.plannedUnitCost)}</div>
                      <div className="w-24 shrink-0 text-right font-medium tabular-nums">{money(p.totalCost)}</div>
                      <button onClick={() => void removePurchase(p.id)} disabled={busy === p.id} className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600" aria-label="Удалить материал"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); void addPurchase(); }} className="grid grid-cols-[1fr_64px_64px_96px_auto] gap-2">
                <input value={row.name} onChange={(e) => setRow((r) => ({ ...r, name: e.target.value }))} placeholder="Материал: PLA, ткань, провод…" className={input} />
                <input value={row.quantity} onChange={(e) => setRow((r) => ({ ...r, quantity: e.target.value }))} inputMode="decimal" className={input} aria-label="Количество" />
                <input value={row.unit} onChange={(e) => setRow((r) => ({ ...r, unit: e.target.value }))} className={input} aria-label="Единица" />
                <input value={row.price} onChange={(e) => setRow((r) => ({ ...r, price: e.target.value }))} inputMode="decimal" placeholder="Цена, ₽" className={input} aria-label="Цена за единицу" />
                <button type="submit" disabled={busy === "add"} className="flex h-9 items-center gap-1 rounded-lg bg-slate-950 px-3 text-[13px] font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-950"><Plus className="h-4 w-4" />Добавить</button>
              </form>
              <p className="mt-1.5 text-[11px] text-slate-400">Количество × цена за единицу. Материалы сразу учитываются в себестоимости.</p>
            </section>

            {/* Прочие расходы */}
            <section className="rounded-xl border border-slate-200 p-4 dark:border-white/[.08]">
              <h3 className="mb-3 text-sm font-semibold">Прочие расходы и оплата</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {COSTS.map(([k, label]) => (
                  <label key={k} className="text-[12px] text-slate-500">{label}, ₽<input inputMode="decimal" value={costs[k] || ""} onChange={(e) => setCosts((c) => ({ ...c, [k]: e.target.value }))} placeholder="0" className={`${input} mt-1`} /></label>
                ))}
                <label className="text-[12px] font-medium text-emerald-700">Получено от клиента, ₽<input inputMode="decimal" value={costs.receivedAmount || ""} onChange={(e) => setCosts((c) => ({ ...c, receivedAmount: e.target.value }))} placeholder="0" className={`${input} mt-1`} /></label>
              </div>
              {costsDirty && <div className="mt-3 flex justify-end"><button onClick={() => void saveCosts()} disabled={busy === "costs"} className="h-9 rounded-lg bg-slate-950 px-4 text-[13px] font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-950">{busy === "costs" ? "Сохраняю…" : "Сохранить расходы"}</button></div>}
            </section>

            {/* Итог */}
            <section className="grid grid-cols-2 gap-3 rounded-xl bg-slate-950 p-4 text-white sm:grid-cols-4 dark:bg-white/[.06]">
              <Stat label="Сумма сделки" value={money(data.deal.value)} />
              <Stat label="Получено" value={money(data.costs.receivedAmount)} />
              <Stat label="Себестоимость" value={money(data.finance.directCost)} />
              <Stat label={`Прибыль${data.costs.receivedAmount ? ` · ${data.finance.margin.toFixed(0)}%` : ""}`} value={money(data.finance.profit)} accent={data.finance.profit < 0 ? "text-rose-300" : "text-emerald-300"} />
            </section>
            {!data.costs.receivedAmount && <p className="-mt-3 text-[11px] text-slate-400">Прибыль считается от полученных денег. Пока оплаты нет, она отрицательная на сумму расходов.</p>}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, accent = "" }: { label: string; value: string; accent?: string }) {
  return <div><div className="text-[11px] text-white/60">{label}</div><div className={`mt-0.5 text-[16px] font-semibold tabular-nums ${accent}`}>{value}</div></div>;
}
