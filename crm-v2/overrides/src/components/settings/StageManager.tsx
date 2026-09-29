"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, Loader2, Lock, Pencil, Plus, Trash2, X } from "lucide-react";

type Stage = { id: string; name: string; color: string; order: number; isWon: boolean | number; isLost: boolean | number; deals?: unknown[] };

const PROTECTED = new Set(["Новый запрос", "Согласовано", "В производстве", "Готово", "Доставка", "Завершено", "Отказ"]);
const COLORS = ["#64748b", "#0ea5e9", "#2563eb", "#7c3aed", "#db2777", "#f97316", "#eab308", "#16a34a", "#0d9488"];

/** Настройки → Этапы воронки: добавить, переименовать, перекрасить, сдвинуть, удалить; куда падает «В работу». */
export function StageManager() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [work, setWork] = useState<{ stageId: string | null; savedId: string | null }>({ stageId: null, savedId: null });
  const [busy, setBusy] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; name: string; color: string } | null>(null);
  const [draft, setDraft] = useState({ name: "", after: "", color: COLORS[1] });

  const load = useCallback(async () => {
    const [p, w] = await Promise.all([
      fetch("/api/pipeline", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/pipeline/work-stage", { cache: "no-store" }).then((r) => r.json()),
    ]);
    const list = (Array.isArray(p) ? p : []) as Stage[];
    setStages(list);
    setWork({ stageId: w.stageId, savedId: w.savedId });
    setDraft((d) => d.after ? d : { ...d, after: list[0]?.id || "" });
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function call(key: string, url: string, init: RequestInit, ok?: string) {
    setBusy(key);
    try {
      const r = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Не удалось сохранить");
      if (ok) toast.success(ok);
      await load();
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); return false; }
    finally { setBusy(null); }
  }

  const open = stages.filter((s) => !s.isWon && !s.isLost);
  const isClosed = (s: Stage) => Boolean(s.isWon || s.isLost);
  const canMove = (s: Stage, dir: -1 | 1) => {
    if (isClosed(s) || s.name === "Новый запрос") return false;
    const i = stages.findIndex((x) => x.id === s.id);
    const o = stages[i + dir];
    return Boolean(o && !isClosed(o) && o.name !== "Новый запрос");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/30 p-3">
        <div className="text-[13px] font-medium">Кнопка «В работу» в «Сообщениях» переносит клиента на этап</div>
        <select value={work.savedId || ""} onChange={(e) => void call("work", "/api/pipeline/work-stage", { method: "PUT", body: JSON.stringify({ stageId: e.target.value || null }) }, "Сохранено")}
          className="mt-2 h-9 w-full max-w-lg rounded-lg border bg-background px-2.5 text-sm">
          <option value="">Автоматически — следующий после «Новый запрос»{open[1] ? ` (сейчас «${open[1].name}»)` : ""}</option>
          {open.slice(1).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="divide-y rounded-xl border">
        {stages.map((s, i) => {
          const locked = PROTECTED.has(s.name);
          const count = Array.isArray(s.deals) ? s.deals.length : 0;
          const editing = edit?.id === s.id;
          return (
            <div key={s.id} className="flex items-center gap-2 px-3 py-2">
              <span className="w-5 text-right text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
              {editing ? (
                <form className="flex flex-1 flex-wrap items-center gap-2" onSubmit={async (e) => { e.preventDefault(); if (await call(s.id, "/api/pipeline", { method: "PATCH", body: JSON.stringify({ stageId: s.id, ...(locked ? {} : { name: edit.name }), color: edit.color }) }, "Этап сохранён")) setEdit(null); }}>
                  <input autoFocus disabled={locked} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm disabled:opacity-60" />
                  <div className="flex gap-1">{COLORS.map((c) => <button type="button" key={c} onClick={() => setEdit({ ...edit, color: c })} className={`h-5 w-5 rounded-full ring-offset-1 ${edit.color === c ? "ring-2 ring-slate-900" : ""}`} style={{ background: c }} aria-label={c} />)}</div>
                  <button type="submit" className="rounded-md bg-slate-900 p-1.5 text-white" aria-label="Сохранить">{busy === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}</button>
                  <button type="button" onClick={() => setEdit(null)} className="rounded-md border p-1.5" aria-label="Отмена"><X className="h-3.5 w-3.5" /></button>
                </form>
              ) : (
                <>
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {s.name}
                    {work.stageId === s.id && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">«В работу» сюда</span>}
                    {isClosed(s) && <span className="ml-2 text-[11px] text-muted-foreground">{s.isWon ? "итог: успех" : "итог: отказ"}</span>}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{count ? `${count} сд.` : ""}</span>
                  {locked && <span title="Системный этап: его использует производство, доставка или магазин — можно менять только цвет"><Lock className="h-3.5 w-3.5 text-muted-foreground/60" /></span>}
                  <button type="button" disabled={!canMove(s, -1) || Boolean(busy)} onClick={() => void call(s.id, "/api/pipeline", { method: "PATCH", body: JSON.stringify({ stageId: s.id, move: "up" }) })} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-25" aria-label="Выше"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" disabled={!canMove(s, 1) || Boolean(busy)} onClick={() => void call(s.id, "/api/pipeline", { method: "PATCH", body: JSON.stringify({ stageId: s.id, move: "down" }) })} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-25" aria-label="Ниже"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => setEdit({ id: s.id, name: s.name, color: s.color })} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Изменить"><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" disabled={locked || isClosed(s) || Boolean(busy)} onClick={() => { if (confirm(`Удалить этап «${s.name}»?`)) void call(s.id, `/api/pipeline?stageId=${encodeURIComponent(s.id)}`, { method: "DELETE" }, "Этап удалён"); }} className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 disabled:opacity-25" aria-label="Удалить"><Trash2 className="h-3.5 w-3.5" /></button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={async (e) => { e.preventDefault(); if (!draft.name.trim()) return toast.error("Напиши название этапа"); if (await call("add", "/api/pipeline", { method: "POST", body: JSON.stringify({ name: draft.name.trim(), color: draft.color, afterStageId: draft.after || null }) }, `Этап «${draft.name.trim()}» добавлен`)) setDraft((d) => ({ ...d, name: "" })); }}
        className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed p-3">
        <label className="min-w-[160px] flex-1 text-[12px] text-muted-foreground">Новый этап<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Например, Уточнение" className="mt-1 h-9 w-full rounded-lg border bg-background px-2.5 text-sm text-foreground" /></label>
        <label className="min-w-[160px] text-[12px] text-muted-foreground">Поставить после<select value={draft.after} onChange={(e) => setDraft({ ...draft, after: e.target.value })} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground">{open.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <div className="flex gap-1 pb-2">{COLORS.map((c) => <button type="button" key={c} onClick={() => setDraft({ ...draft, color: c })} className={`h-5 w-5 rounded-full ring-offset-1 ${draft.color === c ? "ring-2 ring-slate-900" : ""}`} style={{ background: c }} aria-label={c} />)}</div>
        <button type="submit" disabled={busy === "add"} className="flex h-9 items-center gap-1 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-40"><Plus className="h-4 w-4" />Добавить</button>
      </form>
      <p className="text-[11.5px] text-muted-foreground">Системные этапы (с замком) нужны производству, доставке и магазину — их можно перекрасить, но не переименовать и не удалить. Этап со сделками удалить нельзя: сначала перенеси сделки.</p>
    </div>
  );
}
