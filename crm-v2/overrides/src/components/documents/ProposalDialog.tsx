"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Copy, FileText, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";

type Item = { name: string; description?: string; qty?: number | null; price?: number | null };
type Proposal = { title: string; intro: string; items: Item[]; timeline: string; payment: string; delivery: string; notes: string; missing: string[] };
export type SavedDoc = { id: string; name: string; mimeType?: string | null; sizeBytes?: number };

const rub = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n) + " ₽";
const input = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-slate-400 dark:border-white/[.1] dark:bg-transparent";

/** КП от AI: собрать черновик по переписке и документам, поправить и сохранить .docx в файлы клиента. */
export function ProposalDialog({ open, contactId, dealId, onClose, onSaved, saveLabel = "Сохранить .docx" }: {
  open: boolean; contactId: string; dealId?: string | null; onClose: () => void; onSaved?: (doc: SavedDoc, text: string) => void; saveLabel?: string;
}) {
  const [instructions, setInstructions] = useState("");
  const [p, setP] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState<"gen" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!open) { setError(null); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open, busy, onClose]);
  if (!open) return null;

  async function generate() {
    setBusy("gen"); setError(null);
    try {
      const r = await fetch("/api/ai/proposal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "generate", contactId, dealId, instructions }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Не удалось составить КП");
      setP(d.proposal);
    } catch (e) { setError(e instanceof Error ? e.message : "Ошибка"); } finally { setBusy(null); }
  }

  async function save() {
    if (!p) return;
    setBusy("save");
    try {
      const r = await fetch("/api/ai/proposal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", contactId, dealId, proposal: p }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Не удалось сохранить");
      toast.success("КП сохранено в файлы клиента");
      onSaved?.(d.document, d.text);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); } finally { setBusy(null); }
  }

  function asText() {
    if (!p) return "";
    const lines = [p.title, "", p.intro, ""];
    p.items.forEach((i, k) => lines.push(`${k + 1}. ${i.name}${i.description ? ` — ${i.description}` : ""}${i.qty ? `, ${i.qty} шт.` : ""}${i.price != null ? ` — ${rub(i.price)}` : ""}`));
    if (total) lines.push("", `Итого: ${rub(total)}`);
    if (p.timeline) lines.push("", `Сроки: ${p.timeline}`);
    if (p.payment) lines.push(`Оплата: ${p.payment}`);
    if (p.delivery) lines.push(`Доставка: ${p.delivery}`);
    if (p.notes) lines.push("", p.notes);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  const total = p ? p.items.reduce((s, i) => s + (i.price != null ? Number(i.price) * (Number(i.qty) || 1) : 0), 0) : 0;
  const setItem = (k: number, patch: Partial<Item>) => setP((cur) => cur ? { ...cur, items: cur.items.map((it, i) => (i === k ? { ...it, ...patch } : it)) } : cur);
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\s/g, "").replace(",", ".")) || 0);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-2 sm:p-4" onClick={() => !busy && onClose()}>
      <div className="flex max-h-[94vh] w-[min(860px,98vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#16181d]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-5 py-3.5 dark:border-white/[.08]">
          <Sparkles className="h-4 w-4 text-violet-500" /><div className="text-[15px] font-semibold">КП от AI</div>
          <span className="text-[12px] text-slate-400">по переписке, документам клиента и прошлым КП</span>
          <button onClick={onClose} disabled={Boolean(busy)} className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[.06]" aria-label="Закрыть"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!p ? (
            <div className="space-y-3">
              <label className="block text-[13px] font-medium">Что учесть (необязательно)
                <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} placeholder="Например: 2 подвесных светильника Ø60 см, белый PLA, срок 21 день, доставка СДЭК" className={`${input} mt-1.5 text-[14px]`} />
              </label>
              <p className="text-[12px] leading-5 text-slate-500">AI прочитает переписку с клиентом, его файлы (Word, Excel), сумму и срок из сделки и ваши прошлые КП. Цены и сроки он не придумывает — если их нет, оставит пустыми и подскажет, что уточнить.</p>
              {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</div>}
            </div>
          ) : (
            <div className="space-y-4">
              {p.missing.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-[13px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  <div className="mb-1 flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" />Проверь перед отправкой</div>
                  <ul className="list-disc space-y-0.5 pl-5">{p.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </div>
              )}
              <input value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} className={`${input} text-[16px] font-semibold`} />
              <textarea value={p.intro} onChange={(e) => setP({ ...p, intro: e.target.value })} rows={3} className={input} placeholder="Вступление" />
              <div className="rounded-xl border dark:border-white/[.08]">
                <div className="grid grid-cols-[1fr_70px_110px_28px] gap-2 border-b px-3 py-2 text-[11px] font-medium text-slate-400 dark:border-white/[.08]"><span>Позиция</span><span>Кол-во</span><span>Цена, ₽</span><span /></div>
                {p.items.map((it, k) => (
                  <div key={k} className="grid grid-cols-[1fr_70px_110px_28px] items-start gap-2 border-b px-3 py-2 last:border-0 dark:border-white/[.06]">
                    <div className="space-y-1"><input value={it.name} onChange={(e) => setItem(k, { name: e.target.value })} className={input} placeholder="Название" /><input value={it.description || ""} onChange={(e) => setItem(k, { description: e.target.value })} className={`${input} text-[12px] text-slate-500`} placeholder="Размеры, материал, цвет" /></div>
                    <input value={it.qty ?? ""} onChange={(e) => setItem(k, { qty: num(e.target.value) })} inputMode="decimal" className={input} />
                    <input value={it.price ?? ""} onChange={(e) => setItem(k, { price: num(e.target.value) })} inputMode="decimal" placeholder="уточнить" className={`${input} ${it.price == null ? "border-amber-300 bg-amber-50/50" : ""}`} />
                    <button type="button" onClick={() => setP({ ...p, items: p.items.filter((_, i) => i !== k) })} className="mt-1 rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600" aria-label="Убрать"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2">
                  <button type="button" onClick={() => setP({ ...p, items: [...p.items, { name: "", description: "", qty: 1, price: null }] })} className="flex items-center gap-1 text-[12px] font-medium text-slate-600 hover:text-slate-900"><Plus className="h-3.5 w-3.5" />Позиция</button>
                  <span className="text-[13px] font-semibold tabular-nums">{total ? `Итого ${rub(total)}` : "Итого — после цен"}</span>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["timeline", "payment", "delivery", "notes"] as const).map((f) => (
                  <label key={f} className="text-[12px] font-medium text-slate-500">{{ timeline: "Сроки", payment: "Оплата", delivery: "Доставка", notes: "Важно / что входит" }[f]}
                    <textarea value={p[f]} onChange={(e) => setP({ ...p, [f]: e.target.value })} rows={2} className={`${input} mt-1 text-slate-800 dark:text-slate-100`} />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3 dark:border-white/[.08]">
          {!p ? (
            <button type="button" onClick={() => void generate()} disabled={busy === "gen"} className="ml-auto flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-4 text-[13px] font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">
              {busy === "gen" ? <><Loader2 className="h-4 w-4 animate-spin" />Составляю… до минуты</> : <><Sparkles className="h-4 w-4" />Составить КП</>}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => { setP(null); }} disabled={Boolean(busy)} className="h-9 rounded-lg px-3 text-[13px] text-slate-500 hover:text-slate-900">Составить заново</button>
              <button type="button" onClick={() => { void navigator.clipboard.writeText(asText()).then(() => toast.success("Текст КП скопирован")); }} className="ml-auto flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] dark:border-white/[.1]"><Copy className="h-4 w-4" />Скопировать текстом</button>
              <button type="button" onClick={() => void save()} disabled={busy === "save"} className="flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-4 text-[13px] font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}{saveLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
