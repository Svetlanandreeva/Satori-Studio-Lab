"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Boxes, Edit3, ExternalLink, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type PurchaseStatus = "planned" | "ordered" | "paid" | "received";

type Deal = {
  dealId: string;
  dealTitle: string;
  dealValue: number;
  contactId: string;
  contactName: string;
  company?: string | null;
  stageName: string;
  plannedProcurementCost: number;
  procurementCost: number;
  procurementVariance: number;
  itemsCount: number;
};

type Purchase = {
  id: string;
  dealId: string;
  dealTitle: string;
  contactName: string;
  name: string;
  quantity: number;
  unit: string;
  plannedUnitCost: number;
  plannedTotalCost: number;
  unitCost: number;
  totalCost: number;
  variance: number;
  supplier?: string | null;
  status: PurchaseStatus;
  purchaseDate?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
};

type Payload = {
  deals: Deal[];
  purchases: Purchase[];
  plannedTotal: number;
  actualTotal: number;
  variance: number;
  total: number;
};

type Form = {
  id: string;
  dealId: string;
  name: string;
  quantity: string;
  unit: string;
  plannedUnitCost: string;
  unitCost: string;
  supplier: string;
  status: PurchaseStatus;
  purchaseDate: string;
  sourceUrl: string;
  notes: string;
};

const emptyForm: Form = {
  id: "",
  dealId: "",
  name: "",
  quantity: "1",
  unit: "шт.",
  plannedUnitCost: "",
  unitCost: "",
  supplier: "",
  status: "planned",
  purchaseDate: "",
  sourceUrl: "",
  notes: "",
};

const statusMeta: Record<PurchaseStatus, { label: string; className: string }> = {
  planned: { label: "Планируется", className: "border-slate-200 bg-slate-50 text-slate-600" },
  ordered: { label: "Заказано", className: "border-amber-200 bg-amber-50 text-amber-700" },
  paid: { label: "Оплачено", className: "border-blue-200 bg-blue-50 text-blue-700" },
  received: { label: "Получено", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

function rubles(cents: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format((Number(cents) || 0) / 100);
}
function signedRubles(cents: number) {
  const value = Number(cents) || 0;
  return `${value > 0 ? "+" : ""}${rubles(value)}`;
}
function cents(value: string) {
  const n = Number(String(value || "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}
function rublesInput(value: number) { return value ? String(value / 100) : ""; }
function formatDate(value?: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Intl.DateTimeFormat("ru-RU").format(new Date(year, month - 1, day)) : value;
}
function varianceClass(value: number) {
  return value > 0 ? "text-rose-600" : value < 0 ? "text-emerald-700" : "text-slate-500";
}

export default function ProcurementPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dealFilter, setDealFilter] = useState("");
  const [form, setForm] = useState<Form>(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/procurement", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось загрузить закупки");
      setData(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.purchases || []).filter((item) => {
      if (dealFilter && item.dealId !== dealFilter) return false;
      if (!q) return true;
      return [item.name, item.supplier, item.dealTitle, item.contactName, item.notes, statusMeta[item.status]?.label]
        .some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [data, search, dealFilter]);

  const visiblePlanned = visible.reduce((sum, item) => sum + Number(item.plannedTotalCost || 0), 0);
  const visibleActual = visible.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
  const visibleVariance = visibleActual - visiblePlanned;

  function add(dealId = "") {
    setForm({ ...emptyForm, dealId: dealId || dealFilter || "" });
    setOpen(true);
  }

  function edit(item: Purchase) {
    setForm({
      id: item.id,
      dealId: item.dealId,
      name: item.name,
      quantity: String(item.quantity || 1),
      unit: item.unit || "шт.",
      plannedUnitCost: rublesInput(item.plannedUnitCost),
      unitCost: rublesInput(item.unitCost),
      supplier: item.supplier || "",
      status: item.status || "planned",
      purchaseDate: item.purchaseDate || "",
      sourceUrl: item.sourceUrl || "",
      notes: item.notes || "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.dealId || !form.name.trim()) return toast.error("Выберите сделку и укажите материал");
    if (form.sourceUrl && !/^https?:\/\//i.test(form.sourceUrl.trim())) return toast.error("Ссылка должна начинаться с http:// или https://");
    setSaving(true);
    try {
      const response = await fetch("/api/procurement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: form.id || undefined,
          dealId: form.dealId,
          name: form.name,
          quantity: Number(form.quantity.replace(",", ".")) || 1,
          unit: form.unit || "шт.",
          plannedUnitCost: cents(form.plannedUnitCost),
          unitCost: cents(form.unitCost),
          supplier: form.supplier || null,
          status: form.status,
          purchaseDate: form.purchaseDate || null,
          sourceUrl: form.sourceUrl || null,
          notes: form.notes || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось сохранить закупку");
      toast.success(form.id ? "Позиция обновлена" : "Закупка добавлена");
      setOpen(false);
      setForm(emptyForm);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Удалить эту позицию из закупок? Фактическая стоимость перестанет учитываться в расходах сделки.")) return;
    const response = await fetch(`/api/procurement?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) return toast.error(payload.error || "Не удалось удалить");
    toast.success("Позиция удалена из расчёта");
    await load();
  }

  if (loading && !data) {
    return <div className="flex min-h-72 items-center justify-center text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Загрузка закупок…</div>;
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
      <section className="flex flex-col gap-4 rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-7">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-slate-400"><Boxes className="h-4 w-4" /> Материалы и комплектующие</div>
          <h1 className="text-3xl font-semibold tracking-[-.035em] text-slate-950">Закупки</h1>
          <p className="mt-2 max-w-3xl text-[15px] leading-6 text-slate-500">План показывает ожидаемую себестоимость. В финансовый результат сделки попадает фактическая стоимость — она автоматически уменьшает прибыль и маржу.</p>
        </div>
        <Button onClick={() => add()} className="h-11 rounded-xl"><Plus className="mr-2 h-4 w-4" />Добавить материал</Button>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="План закупок" value={rubles(dealFilter ? visiblePlanned : data?.plannedTotal || 0)} />
        <Stat label="Факт закупок" value={rubles(dealFilter ? visibleActual : data?.actualTotal || 0)} />
        <Stat label="Отклонение" value={signedRubles(dealFilter ? visibleVariance : data?.variance || 0)} tone={varianceClass(dealFilter ? visibleVariance : data?.variance || 0)} />
        <Stat label="Позиций" value={String(visible.length)} />
      </div>

      <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_320px]">
          <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Материал, поставщик, клиент, сделка или статус" className="h-11 rounded-xl pl-10" /></div>
          <select value={dealFilter} onChange={(e) => setDealFilter(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option value="">Все сделки</option>
            {(data?.deals || []).map((deal) => <option key={deal.dealId} value={deal.dealId}>{deal.contactName} · {deal.dealTitle}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-slate-50/70 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-3">Сделка</th><th className="px-4 py-3">Материал</th><th className="px-4 py-3">Статус</th><th className="px-4 py-3">Количество</th><th className="px-4 py-3 text-right">План</th><th className="px-4 py-3 text-right">Факт</th><th className="px-4 py-3 text-right">Отклонение</th><th className="px-4 py-3">Поставщик / дата</th><th className="px-5 py-3 text-right">Действия</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((item) => {
                const meta = statusMeta[item.status] || statusMeta.planned;
                return <tr key={item.id} className="hover:bg-slate-50/40">
                  <td className="px-5 py-4"><Link href={`/deals/${item.dealId}`} className="font-medium text-slate-900 hover:underline">{item.dealTitle}</Link><div className="mt-0.5 text-xs text-slate-400">{item.contactName}</div></td>
                  <td className="px-4 py-4"><div className="font-medium text-slate-800">{item.name}</div>{item.notes && <div className="mt-0.5 max-w-[240px] truncate text-xs text-slate-400">{item.notes}</div>}{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"><ExternalLink className="h-3 w-3" />Товар / чек</a>}</td>
                  <td className="px-4 py-4"><Badge variant="outline" className={meta.className}>{meta.label}</Badge></td>
                  <td className="px-4 py-4 text-slate-600">{item.quantity} {item.unit}</td>
                  <td className="px-4 py-4 text-right text-slate-600">{rubles(item.plannedTotalCost)}</td>
                  <td className="px-4 py-4 text-right font-semibold text-slate-900">{rubles(item.totalCost)}</td>
                  <td className={`px-4 py-4 text-right font-medium ${varianceClass(item.variance)}`}>{signedRubles(item.variance)}</td>
                  <td className="px-4 py-4 text-slate-500"><div>{item.supplier || "—"}</div><div className="mt-0.5 text-xs text-slate-400">{formatDate(item.purchaseDate)}</div></td>
                  <td className="px-5 py-4"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => edit(item)}><Edit3 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-rose-500" onClick={() => void remove(item.id)}><Trash2 className="h-4 w-4" /></Button></div></td>
                </tr>;
              })}
              {!visible.length && <tr><td colSpan={9} className="px-5 py-12 text-center text-sm text-slate-400">Пока нет закупок. Добавь материалы, комплектующие или расходники для конкретной сделки.</td></tr>}
            </tbody>
            {visible.length > 0 && <tfoot className="border-t bg-slate-50/50"><tr><td colSpan={4} className="px-5 py-4 font-medium text-slate-600">Итого по выбранному списку</td><td className="px-4 py-4 text-right font-semibold">{rubles(visiblePlanned)}</td><td className="px-4 py-4 text-right font-semibold">{rubles(visibleActual)}</td><td className={`px-4 py-4 text-right font-semibold ${varianceClass(visibleVariance)}`}>{signedRubles(visibleVariance)}</td><td colSpan={2} /></tr></tfoot>}
          </table>
        </div>
      </section>

      {open && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/35 p-4 backdrop-blur-sm"><div className="my-auto w-full max-w-3xl rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-slate-950">{form.id ? "Изменить закупку" : "Добавить закупку"}</h2><p className="mt-1 text-sm text-slate-400">План нужен для оценки бюджета, факт — для реальной себестоимости сделки.</p></div><Badge variant="outline">Закупки</Badge></div>
        <div className="mt-5 space-y-4">
          <Field label="Сделка"><select value={form.dealId} onChange={(e) => setForm((f) => ({ ...f, dealId: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Выберите сделку</option>{(data?.deals || []).map((deal) => <option key={deal.dealId} value={deal.dealId}>{deal.contactName} · {deal.dealTitle} · {deal.stageName}</option>)}</select></Field>
          <Field label="Материал / комплектующая"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Например: PETG чёрный" className="h-11 rounded-xl" /></Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Количество"><Input value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} inputMode="decimal" className="h-11 rounded-xl" /></Field>
            <Field label="Единица"><Input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="шт., кг, м" className="h-11 rounded-xl" /></Field>
            <Field label="Статус"><select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PurchaseStatus }))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">{Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Плановая цена за единицу, ₽"><Input value={form.plannedUnitCost} onChange={(e) => setForm((f) => ({ ...f, plannedUnitCost: e.target.value }))} inputMode="decimal" placeholder="Сколько планировали" className="h-11 rounded-xl" /></Field>
            <Field label="Фактическая цена за единицу, ₽"><Input value={form.unitCost} onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} inputMode="decimal" placeholder="Сколько реально заплатили" className="h-11 rounded-xl" /></Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Поставщик"><Input value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} placeholder="Ozon, 1688, фабрика…" className="h-11 rounded-xl" /></Field>
            <Field label="Дата закупки"><Input type="date" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} className="h-11 rounded-xl" /></Field>
          </div>

          <Field label="Ссылка на товар / чек / накладную"><Input value={form.sourceUrl} onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))} placeholder="https://…" className="h-11 rounded-xl" /></Field>
          <Field label="Комментарий"><textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="min-h-20 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-slate-400" placeholder="Артикул, цвет, размер или другое уточнение" /></Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Preview label="План" value={rubles(Math.round((Number(form.quantity.replace(",", ".")) || 1) * cents(form.plannedUnitCost || form.unitCost)))} />
            <Preview label="Факт" value={rubles(Math.round((Number(form.quantity.replace(",", ".")) || 1) * cents(form.unitCost)))} />
            <Preview label="Отклонение" value={signedRubles(Math.round((Number(form.quantity.replace(",", ".")) || 1) * (cents(form.unitCost) - cents(form.plannedUnitCost || form.unitCost))))} />
          </div>
          <p className="text-xs leading-5 text-slate-400">В финансовый расчёт сделки входит только фактическая стоимость. Плановая сумма используется для контроля бюджета и перерасхода.</p>
        </div>
        <div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Отмена</Button><Button onClick={() => void save()} disabled={saving} className="rounded-xl">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{form.id ? "Сохранить" : "Добавить закупку"}</Button></div>
      </div></div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1.5 block text-xs font-medium text-slate-600">{label}</label>{children}</div>;
}
function Stat({ label, value, tone = "text-slate-950" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm"><div className="text-[11px] text-slate-400">{label}</div><div className={`mt-1 text-xl font-semibold ${tone}`}>{value}</div></div>;
}
function Preview({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 px-4 py-3"><div className="text-[11px] text-slate-400">{label}</div><div className="mt-1 font-semibold text-slate-900">{value}</div></div>;
}
