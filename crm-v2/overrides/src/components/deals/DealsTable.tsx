"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Combine, Handshake, Search, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDelete, deleteDeals, NewDealButton } from "./DealActions";

export type DealRow = {
  id: string; title: string | null; value: number; createdAt: string; updatedAt: string;
  contactId: string | null; contactName: string | null; contactPhone: string | null;
  stageId: string | null; stageName: string | null; stageColor: string | null; isWon: boolean | null; isLost: boolean | null;
  isLead?: boolean;
};
type StageLite = { id: string; name: string; color: string; isWon: boolean; isLost: boolean };

const money = (v: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format((Number(v) || 0) / 100);
const shortDate = (v: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(v));

type Scope = "active" | "leads" | "won" | "lost" | "all";

export function DealsTable({ rows, stages }: { rows: DealRow[]; stages: StageLite[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("active");
  const [stage, setStage] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) { setQ(initial); setScope("all"); }
  }, []);
  const [mergeIds, setMergeIds] = useState<string[] | null>(null);
  const [keepId, setKeepId] = useState("");

  // Сколько открытых сделок у каждого клиента — чтобы подсветить вероятные дубли.
  const openByContact = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) if (r.contactId && !r.isWon && !r.isLost) map.set(r.contactId, (map.get(r.contactId) || 0) + 1);
    return map;
  }, [rows]);

  function openMerge(ids: string[]) {
    const picked = rows.filter((r) => ids.includes(r.id));
    // По умолчанию оставляем ту, что дальше всех по воронке (затем — с большей суммой).
    const order = (id: string | null) => stages.findIndex((s) => s.id === id);
    const best = [...picked].sort((a, b) => (order(b.stageId) - order(a.stageId)) || ((Number(b.value) || 0) - (Number(a.value) || 0)))[0];
    setKeepId(best?.id || ids[0]);
    setMergeIds(ids);
  }
  async function merge() {
    if (!mergeIds || !keepId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/deals/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keepId, ids: mergeIds }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Не удалось объединить");
      toast.success(`Объединено в одну сделку`);
      setMergeIds(null); setSelected(new Set());
      router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Ошибка"); }
    finally { setBusy(false); }
  }

  const counts = useMemo(() => ({
    active: rows.filter((r) => !r.isWon && !r.isLost && !r.isLead).length,
    leads: rows.filter((r) => r.isLead).length,
    won: rows.filter((r) => r.isWon).length,
    lost: rows.filter((r) => r.isLost).length,
    all: rows.length,
  }), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    return rows.filter((r) => {
      if (scope === "active" && (r.isWon || r.isLost || r.isLead)) return false;
      if (scope === "leads" && !r.isLead) return false;
      if (scope === "won" && !r.isWon) return false;
      if (scope === "lost" && !r.isLost) return false;
      if (stage && r.stageId !== stage) return false;
      if (!needle) return true;
      return [r.title, r.contactName].some((v) => String(v || "").toLowerCase().includes(needle)) ||
        (digits.length >= 3 && String(r.contactPhone || "").replace(/\D/g, "").includes(digits));
    });
  }, [rows, q, scope, stage]);

  const total = filtered.reduce((n, r) => n + (Number(r.value) || 0), 0);
  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(filtered.map((r) => r.id)));
  }
  async function remove(ids: string[]) {
    setBusy(true);
    try {
      await deleteDeals(ids);
      toast.success(ids.length === 1 ? "Сделка удалена" : `Удалено сделок: ${ids.length}`);
      setSelected(new Set()); setConfirm(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить");
    } finally { setBusy(false); }
  }

  const scopes: Array<[Scope, string]> = [["active", "В работе"], ["leads", "Лиды"], ["won", "Завершены"], ["lost", "Отказы"], ["all", "Все"]];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Сделки</h1>
        <div className="ml-auto"><NewDealButton /></div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-3 dark:border-white/[.06] lg:flex-row lg:items-center">
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-white/[.05]">
            {scopes.map(([key, label]) => (
              <button key={key} onClick={() => { setScope(key); setSelected(new Set()); }} className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${scope === key ? "bg-white text-slate-950 shadow-sm dark:bg-white/[.12] dark:text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"}`}>
                {label} <span className="ml-0.5 text-slate-400">{counts[key]}</span>
              </button>
            ))}
          </div>
          <select value={stage} onChange={(e) => setStage(e.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-600 outline-none dark:border-white/[.08] dark:bg-transparent dark:text-slate-300">
            <option value="">Все этапы</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: название, клиент, телефон" className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-3 text-[13px] outline-none focus:border-slate-300 focus:bg-white dark:border-white/[.08] dark:bg-white/[.03]" />
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-950 px-4 py-2 text-[13px] text-white dark:border-white/[.06]">
            <span>Выбрано: {selected.size}</span>
            {selected.size >= 2 && <button onClick={() => openMerge([...selected])} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 font-medium text-slate-900 hover:bg-slate-100"><Combine className="h-3.5 w-3.5" />Объединить в одну</button>}
            <button onClick={() => setConfirm([...selected])} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1 font-medium hover:bg-rose-600"><Trash2 className="h-3.5 w-3.5" />Удалить</button>
            <button onClick={() => setSelected(new Set())} className="ml-auto inline-flex items-center gap-1 text-white/70 hover:text-white"><X className="h-3.5 w-3.5" />Снять выбор</button>
          </div>
        )}

        <div className="hidden grid-cols-[36px_minmax(0,1fr)_170px_120px_90px_40px] items-center gap-3 border-b border-slate-100 px-4 py-2 text-[11px] font-medium text-slate-400 dark:border-white/[.06] md:grid">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Выбрать все" className="h-4 w-4 accent-slate-900" />
          <div>Сделка и клиент</div><div>Этап</div><div className="text-right">Сумма</div><div className="text-right">Изменена</div><div />
        </div>

        <div className="divide-y divide-slate-100 dark:divide-white/[.06]">
          {filtered.map((d) => (
            <div key={d.id} className={`group grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50 dark:hover:bg-white/[.03] md:grid-cols-[36px_minmax(0,1fr)_170px_120px_90px_40px] ${selected.has(d.id) ? "bg-violet-50/60 dark:bg-violet-500/10" : ""}`}>
              <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} aria-label="Выбрать" className="h-4 w-4 accent-slate-900" />
              <Link href={`/deals/${d.id}`} className="min-w-0">
                <div className="truncate text-[14px] font-medium text-slate-900 group-hover:underline dark:text-white">{d.title || "Без названия"}</div>
                <div className="truncate text-[12px] text-slate-500">{d.contactName || "Без клиента"}{d.contactPhone ? ` · ${d.contactPhone}` : ""}{d.contactId && (openByContact.get(d.contactId) || 0) > 1 && !d.isWon && !d.isLost ? <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQ(d.contactName || ""); setScope("all"); }} className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100">у клиента {openByContact.get(d.contactId)} открытых — дубли?</button> : null}</div>
              </Link>
              <div className="hidden md:block"><span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-slate-100 px-2.5 py-1 text-[12px] text-slate-700 dark:bg-white/[.06] dark:text-slate-300"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.stageColor || "#94a3b8" }} />{d.stageName || "Без этапа"}</span></div>
              <div className="text-right text-[14px] font-semibold tabular-nums text-slate-900 dark:text-white">{money(d.value)}<div className="text-[11px] font-normal text-slate-400 md:hidden">{d.stageName}</div></div>
              <div className="hidden text-right text-[12px] text-slate-400 md:block">{shortDate(d.updatedAt)}</div>
              <button onClick={() => setConfirm([d.id])} className="hidden h-8 w-8 items-center justify-center rounded-lg text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 md:flex" aria-label="Удалить сделку"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        {!filtered.length && (
          <div className="p-12 text-center">
            <Handshake className="mx-auto h-7 w-7 text-slate-300" />
            <div className="mt-3 text-sm text-slate-500">{scope === "active" && counts.leads ? "Сделок в работе нет. Лиды становятся сделками, когда переводишь их из «Новой заявки» в «Расчёт»." : rows.length ? "Ничего не нашлось — поменяй фильтр или поиск." : "Сделок пока нет. Создай первую."}</div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-[12px] text-slate-500 dark:border-white/[.06]">
          <span>Показано {filtered.length} из {rows.length}</span>
          <span>Сумма: <b className="font-semibold text-slate-900 dark:text-white">{money(total)}</b></span>
        </div>
      </section>

      <Dialog open={Boolean(mergeIds)} onOpenChange={(v) => !v && !busy && setMergeIds(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Объединить в одну сделку</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Выбери, какая остаётся. Остальные удалятся, а их переписка, задачи, закупки и файлы перейдут к ней. Если у основной нет оплаты или сроков — возьмутся с дубля.</p>
          <div className="space-y-1.5">
            {rows.filter((r) => mergeIds?.includes(r.id)).map((r) => (
              <label key={r.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${keepId === r.id ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                <input type="radio" name="keep" checked={keepId === r.id} onChange={() => setKeepId(r.id)} className="accent-slate-900" />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.title || "Без названия"}</span><span className="block truncate text-xs text-slate-500">{r.contactName} · {r.stageName}</span></span>
                <span className="shrink-0 tabular-nums">{money(r.value)}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setMergeIds(null)} disabled={busy}>Отмена</Button>
            <Button onClick={() => void merge()} disabled={busy}>{busy ? "Объединяю…" : "Объединить"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDelete open={Boolean(confirm)} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => confirm && void remove(confirm)}
        title={confirm && confirm.length > 1 ? `Удалить ${confirm.length} сделок?` : "Удалить сделку?"}
        text="Сделка пропадёт из воронки вместе с закупками и историей этапов. Клиенты и переписка останутся." />
    </div>
  );
}
