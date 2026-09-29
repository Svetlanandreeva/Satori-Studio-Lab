"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yekaterinburg" }).format(new Date());
const field = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] outline-none focus:border-slate-400 dark:border-white/[.1] dark:bg-transparent";

/** Владелец: записать выплату менеджеру и поменять процент. */
export function EarningsOwnerTools({ memberId, rate, due }: { memberId: string; rate: number; due: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [pct, setPct] = useState(String(rate));
  const [busy, setBusy] = useState(false);
  async function post(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/earnings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberId, ...body }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Не удалось сохранить");
      toast.success(ok); setAmount(""); setNote(""); router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); } finally { setBusy(false); }
  }
  const kop = Math.round((Number(amount.replace(/\s/g, "").replace(",", ".")) || 0) * 100);
  return (
    <div className="flex flex-wrap items-end gap-2 text-[12px] text-slate-500">
      <label>Сумма, ₽<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={due > 0 ? String(Math.round(due / 100)) : "0"} className={`${field} mt-1 block w-32`} /></label>
      <label>Дата<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1 block`} /></label>
      <label className="min-w-[180px] flex-1">Комментарий<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: зарплата за сентябрь" className={`${field} mt-1 block w-full`} /></label>
      <button type="button" disabled={busy || kop <= 0} onClick={() => void post({ action: "payout", amount: kop, paidAt: date, note }, "Выплата записана")} className="flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-[13px] font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Записать выплату</button>
      <div className="ml-auto flex items-end gap-2">
        <label>Процент от прибыли<input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" className={`${field} mt-1 block w-20`} /></label>
        <button type="button" disabled={busy || pct === String(rate)} onClick={() => void post({ action: "rate", rate: Number(pct.replace(",", ".")) }, "Процент сохранён")} className="h-9 rounded-lg border px-3 text-[13px] disabled:opacity-40 dark:border-white/[.1]">Сохранить</button>
      </div>
    </div>
  );
}

export function DeletePayout({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} aria-label="Удалить выплату" onClick={async () => {
      setBusy(true);
      const r = await fetch(`/api/earnings?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setBusy(false);
      if (r.ok) { toast.success("Выплата удалена"); router.refresh(); } else toast.error("Не удалось удалить");
    }} className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
  );
}
