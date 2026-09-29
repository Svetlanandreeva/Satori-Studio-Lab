"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { autosaveLabel, useAutosave } from "@/lib/use-autosave";
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

  const term = Number(dates.term) || 0;
  const deadline = dates.paidAt && term ? addDays(dates.paidAt, term) : data?.schedule.deadline || null;
  const badge = deadlineBadge(deadline, data?.schedule.shippedAt || null);
  const termInvalid = Boolean(dates.term) && (term < 1 || term > 365);
  const datesDirty = Boolean(data && !termInvalid && (dates.paidAt !== (data.schedule.paidAt || "") || dates.term !== (data.schedule.termDays ? String(data.schedule.termDays) : "")));
  const costsDirty = Boolean(data && [...COSTS.map(([k]) => k), "receivedAmount" as const].some((k) => toKop(costs[k] || "") !== (data.costs as Record<string, number>)[k]));

  // Автосохранение: сроки и расходы сохраняются сами, без кнопок.
  const datesAuto = useAutosave({ dealId: data?.deal.id, ...dates }, datesDirty, async (d, { keepalive }) => {
    if (!d.dealId) return;
    const t = Number(d.term) || 0;
    const res = await fetch(`/api/deals/${d.dealId}`, { method: "PUT", keepalive, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paidAt: d.paidAt || null, termDays: d.term ? t : null }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "ошибка сервера");
    const fresh = await fetch(`/api/production/project?dealId=${encodeURIComponent(d.dealId)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (fresh?.deal?.id === d.dealId) setData(fresh);
    onChanged?.();
  });
  const costsAuto = useAutosave({ dealId: data?.deal.id, ...costs } as Record<string, string | undefined>, costsDirty, async (c, { keepalive }) => {
    if (!c.dealId) return;
    const body: Record<string, unknown> = { dealId: c.dealId };
    for (const [k] of COSTS) body[k] = toKop(String(c[k] || ""));
    body.receivedAmount = toKop(String(c.receivedAmount || ""));
    const res = await fetch("/api/production/project", { method: "PUT", keepalive, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "ошибка сервера");
    if (d?.deal?.id === c.dealId) setData(d);
    onChanged?.();
  });
  const SaveState = ({ a, invalid }: { a: ReturnType<typeof useAutosave>; invalid?: string }) => {
    const l = invalid ? { text: invalid, tone: "text-rose-600" } : autosaveLabel(a.status, a.error);
    return <span className={`flex items-center gap-1 text-[11.5px] font-normal ${l.tone}`}>{(a.status === "saving" || a.status === "pending") && !invalid ? <Loader2 className="h-3 w-3 animate-spin" /> : a.status === "saved" && !invalid ? <Check className="h-3 w-3" /> : null}{l.text}{a.status === "error" && <button type="button" onClick={() => void a.flush()} className="ml-1 underline">Повторить</button>}</span>;
  };

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
              <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Сроки</h3><SaveState a={datesAuto} invalid={termInvalid ? "Срок — от 1 до 365 дней" : undefined} /></div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.3fr] sm:items-end">
                <label className="text-[12px] text-slate-500">Дата оплаты · старт<input type="date" value={dates.paidAt} onChange={(e) => setDates((d) => ({ ...d, paidAt: e.target.value }))} className={`${input} mt-1`} /></label>
                <label className="text-[12px] text-slate-500">Срок, дней<input type="number" min={1} max={365} value={dates.term} onChange={(e) => setDates((d) => ({ ...d, term: e.target.value }))} placeholder="14" className={`${input} mt-1`} /></label>
                <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/[.04]">
                  <div className="text-[11px] text-slate-500">Дедлайн</div>
                  {deadline ? <><div className="text-[15px] font-semibold">{longDate(deadline)}</div>{badge && <span className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${toneClass[badge.tone]}`}>{badge.text}</span>}</> : <div className="text-[12px] text-slate-400">укажи оплату и срок</div>}
                </div>
              </div>
            </section>

            {/* Материалы */}
            <section className="rounded-xl border border-slate-200 p-4 dark:border-white/[.08]">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Материалы</h3><span className="text-[13px] font-semibold tabular-nums">{money(data.procurement.actualTotal)}</span></div>
              {data.purchases.length > 0 && (
                <div className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-100 dark:divide-white/[.06] dark:border-white/[.06]">
                  {data.purchases.map((p) => (
                    <PurchaseRow key={p.id} p={p} dealId={data.deal.id} busy={busy === p.id} onRemove={() => void removePurchase(p.id)} onSaved={async () => { await load(); onChanged?.(); }} />
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
              <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Прочие расходы и оплата</h3><SaveState a={costsAuto} /></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {COSTS.map(([k, label]) => (
                  <label key={k} className="text-[12px] text-slate-500">{label}, ₽<input inputMode="decimal" value={costs[k] || ""} onChange={(e) => setCosts((c) => ({ ...c, [k]: e.target.value }))} placeholder="0" className={`${input} mt-1`} /></label>
                ))}
                <label className="text-[12px] font-medium text-emerald-700">Получено от клиента, ₽<input inputMode="decimal" value={costs.receivedAmount || ""} onChange={(e) => setCosts((c) => ({ ...c, receivedAmount: e.target.value }))} placeholder="0" className={`${input} mt-1`} /></label>
              </div>
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

/** Строка материала: по клику на карандаш (или на строку) — редактирование прямо в списке. */
function PurchaseRow({ p, dealId, busy, onRemove, onSaved }: { p: Purchase; dealId: string; busy: boolean; onRemove: () => void; onSaved: () => Promise<void> }) {
  const price = p.unitCost || p.plannedUnitCost;
  const initial = { name: p.name, quantity: String(p.quantity), unit: p.unit, price: toRub(price) };
  const [edit, setEdit] = useState<typeof initial | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!edit) return;
    if (!edit.name.trim()) return toast.error("Название не может быть пустым");
    const quantity = Number(String(edit.quantity).replace(",", "."));
    if (!(quantity > 0)) return toast.error("Количество должно быть больше нуля");
    setSaving(true);
    try {
      const kop = toKop(edit.price);
      const res = await fetch("/api/procurement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, dealId, name: edit.name.trim(), quantity, unit: edit.unit || "шт.", unitCost: kop, plannedUnitCost: kop, status: p.status || "paid", supplier: p.supplier }) });
      if (!res.ok) throw new Error((await res.json()).error || "Не удалось сохранить");
      await onSaved(); setEdit(null); toast.success("Материал обновлён");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); } finally { setSaving(false); }
  }

  if (edit) {
    const total = toKop(edit.price) * (Number(String(edit.quantity).replace(",", ".")) || 0);
    return (
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEdit(null); } }} className="grid grid-cols-[1fr_64px_64px_96px_auto] items-center gap-2 bg-slate-50 px-2 py-2 dark:bg-white/[.03]">
        <input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={input} aria-label="Материал" />
        <input value={edit.quantity} onChange={(e) => setEdit({ ...edit, quantity: e.target.value })} inputMode="decimal" className={input} aria-label="Количество" />
        <input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} className={input} aria-label="Единица" />
        <input value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} inputMode="decimal" placeholder="Цена, ₽" className={input} aria-label="Цена за единицу" />
        <div className="flex items-center gap-1">
          <button type="submit" disabled={saving} className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white disabled:opacity-40 dark:bg-white dark:text-slate-950" aria-label="Сохранить" title={`Сохранить · ${money(Math.round(total))}`}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</button>
          <button type="button" onClick={() => setEdit(null)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-white dark:border-white/[.1]" aria-label="Отмена"><X className="h-4 w-4" /></button>
        </div>
      </form>
    );
  }

  return (
    <div className="group flex items-center gap-3 px-3 py-2 text-[13px]">
      <button type="button" onClick={() => setEdit(initial)} className="flex min-w-0 flex-1 items-center gap-3 text-left" title="Изменить">
        <span className="min-w-0 flex-1 truncate">{p.name}</span>
        <span className="shrink-0 text-slate-500">{p.quantity} {p.unit} × {money(price)}</span>
        <span className="w-24 shrink-0 text-right font-medium tabular-nums">{money(p.totalCost)}</span>
      </button>
      <button onClick={() => setEdit(initial)} className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-700" aria-label="Изменить материал"><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={onRemove} disabled={busy} className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600" aria-label="Удалить материал"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function Stat({ label, value, accent = "" }: { label: string; value: string; accent?: string }) {
  return <div><div className="text-[11px] text-white/60">{label}</div><div className={`mt-0.5 text-[16px] font-semibold tabular-nums ${accent}`}>{value}</div></div>;
}
