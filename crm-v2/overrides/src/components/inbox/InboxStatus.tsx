"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, ChevronDown, Loader2 } from "lucide-react";

type Status = "new" | "work" | "ignore" | "contractor";
type State = { status: Status; stageName: string | null; dealId: string | null; reason?: string | null };

const REASONS = ["Не наш профиль", "Серийное / массовое производство", "Не целевой запрос", "Спам / реклама"];
const UNQUAL_TEMPLATE_TITLE = "Отказ — не наш профиль";
const FALLBACK_TEXT = "Здравствуйте! Спасибо, что обратились в SATORI. К сожалению, такие заказы мы не выполняем: мы делаем авторские светильники небольшими партиями, а не серийную стандартную продукцию. Надеемся, вы быстро найдёте подходящего производителя, а если понадобится дизайнерский свет — будем рады помочь.";

/** Статус обращения прямо в диалоге: «Новое» → «В работу» / «Не квал» (с причиной и ответом клиенту) / «Подрядчик». */
export function InboxStatus({ channel, threadId, contactId, title, onChanged }: {
  channel: "email" | "telegram"; threadId?: string | null; contactId?: string | null; title: string; onChanged?: () => void;
}) {
  const [state, setState] = useState<State>({ status: "new", stageName: null, dealId: null });
  const [busy, setBusy] = useState<Status | null>(null);
  const [openMenu, setOpenMenu] = useState(false);
  const [unqual, setUnqual] = useState<null | { reason: string; custom: string; send: boolean; text: string }>(null);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUnqual(null);
    if (!contactId) { setState({ status: "new", stageName: null, dealId: null }); return; }
    fetch(`/api/inbox/status?contactId=${encodeURIComponent(contactId)}`, { cache: "no-store" }).then((r) => r.json()).then((d) => { if (!cancelled) setState(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [contactId, threadId]);

  useEffect(() => {
    if (!openMenu) return;
    const on = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpenMenu(false); };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [openMenu]);

  useEffect(() => {
    if (!unqual) return;
    const on = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setUnqual(null); };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [unqual]);

  const firstName = title.split(/\s+/)[0] || "";
  const fill = (t: string) => t.replace(/\{(имя|name)\}/gi, firstName).replace(/\{(клиент|client)\}/gi, title);

  async function openUnqual() {
    let text = FALLBACK_TEXT;
    try {
      const d = await fetch("/api/templates", { cache: "no-store" }).then((r) => r.json());
      const t = (d.templates || []).find((x: { title: string }) => x.title === UNQUAL_TEMPLATE_TITLE);
      if (t?.body) text = t.body;
    } catch {}
    setUnqual({ reason: REASONS[0], custom: "", send: true, text: fill(text) });
  }

  async function sendToClient(text: string) {
    const r = channel === "telegram"
      ? await fetch("/api/integrations/telegram/reply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contactId, text }) })
      : await fetch(`/api/inbox/${encodeURIComponent(String(threadId))}/reply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Статус сохранён, но сообщение клиенту не ушло"); }
  }

  async function set(status: Status, extra: { reason?: string; message?: string } = {}) {
    if ((status === state.status && status !== "ignore") || busy) return;
    setBusy(status);
    try {
      const res = await fetch("/api/inbox/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, channel, threadId, contactId, title, reason: extra.reason }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Не удалось изменить статус");
      setState({ status: d.status, stageName: d.stageName, dealId: d.dealId, reason: d.reason ?? extra.reason ?? null });
      if (extra.message?.trim()) {
        try { await sendToClient(extra.message.trim()); }
        catch (e) { setUnqual(null); onChanged?.(); toast.error(`Отмечено «не квал», но сообщение не ушло: ${e instanceof Error ? e.message : "ошибка"}`); return; }
      }
      toast.success(status === "work" ? `Взято в работу${d.stageName ? ` · ${d.stageName}` : ""}`
        : status === "ignore" ? `Не квал${extra.reason ? ` · ${extra.reason}` : ""}${extra.message ? " · клиенту ответили" : ""}`
        : status === "contractor" ? "Перенесено в «Подрядчики»" : "Снова новое обращение");
      setUnqual(null);
      onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); }
    finally { setBusy(null); }
  }

  const META: Record<Status, { label: string; dot: string }> = {
    new: { label: "Новое", dot: "#94a3b8" },
    work: { label: "В работе", dot: "#059669" },
    ignore: { label: "Не квал", dot: "#475569" },
    contractor: { label: "Подрядчик", dot: "#0284c7" },
  };
  const cur = META[state.status];
  const choose = (value: Status) => { setOpenMenu(false); if (value === "ignore") void openUnqual(); else void set(value); };

  return (
    <div ref={box} className="relative flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setOpenMenu((v) => !v)} disabled={Boolean(busy)}
        className="flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white pl-2.5 pr-2 text-[12.5px] font-medium hover:bg-slate-50 dark:border-white/[.1] dark:bg-transparent dark:hover:bg-white/[.05]">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="h-2 w-2 rounded-full" style={{ background: cur.dot }} />}
        {cur.label}
        {state.status === "work" && state.stageName && <span className="font-normal text-slate-500">· {state.stageName}</span>}
        {state.status === "ignore" && state.reason && <span className="max-w-[160px] truncate font-normal text-slate-500">· {state.reason}</span>}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {state.dealId && state.status === "work" && <Link href={`/deals/${state.dealId}`} className="text-[12px] text-slate-500 hover:text-slate-900 hover:underline">сделка →</Link>}
      {openMenu && (
        <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-xl border bg-white p-1.5 shadow-xl dark:bg-[#1c1f25]">
          {(["new", "work", "ignore", "contractor"] as Status[]).map((v) => (
            <button key={v} type="button" onClick={() => choose(v)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-slate-100 dark:hover:bg-white/[.06]">
              <span className="h-2 w-2 rounded-full" style={{ background: META[v].dot }} />
              {v === "work" ? "Взять в работу" : v === "ignore" ? "Не квал…" : META[v].label}
              {state.status === v && <Check className="ml-auto h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}

      {unqual && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(420px,calc(100vw-32px))] rounded-xl border bg-white p-3 shadow-xl dark:bg-[#1c1f25]">
          <div className="text-[13px] font-semibold">Не квал — почему?</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...REASONS, "Другое"].map((r) => (
              <button key={r} type="button" onClick={() => setUnqual({ ...unqual, reason: r, send: /спам/i.test(r) ? false : unqual.send })}
                className={`rounded-full border px-2.5 py-1 text-[12px] ${unqual.reason === r ? "border-slate-900 bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "hover:bg-slate-50 dark:hover:bg-white/[.06]"}`}>{r}</button>
            ))}
          </div>
          {unqual.reason === "Другое" && <input autoFocus value={unqual.custom} onChange={(e) => setUnqual({ ...unqual, custom: e.target.value })} placeholder="Своя причина" className="mt-2 h-8 w-full rounded-lg border bg-transparent px-2.5 text-[13px] outline-none" />}
          <label className="mt-3 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={unqual.send} onChange={(e) => setUnqual({ ...unqual, send: e.target.checked })} className="h-4 w-4" />Написать клиенту</label>
          {unqual.send && <textarea value={unqual.text} onChange={(e) => setUnqual({ ...unqual, text: e.target.value })} rows={5} className="mt-2 w-full resize-y rounded-lg border bg-transparent px-2.5 py-2 text-[13px] leading-relaxed outline-none" />}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setUnqual(null)} className="h-8 rounded-lg border px-3 text-[13px]">Отмена</button>
            <button type="button" disabled={Boolean(busy) || (unqual.reason === "Другое" && !unqual.custom.trim()) || (unqual.send && !unqual.text.trim())}
              onClick={() => void set("ignore", { reason: unqual.reason === "Другое" ? unqual.custom.trim() : unqual.reason, message: unqual.send ? unqual.text : undefined })}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-[13px] font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">
              {busy === "ignore" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{unqual.send ? "Отметить и отправить" : "Отметить"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
