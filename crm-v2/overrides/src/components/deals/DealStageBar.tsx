"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Stage = { id: string; name: string; color: string; isWon: boolean; isLost: boolean };

const LOSS_REASONS = ["Дорого", "Не подошли сроки", "Клиент пропал", "Выбрал конкурента", "Передумал", "Другое"];

/** Этап сделки: текущий этап с меню, кнопка «следующий этап» и тонкая шкала прогресса. */
export function DealStageBar({ dealId, stageId, stages }: { dealId: string; stageId: string; stages: Stage[] }) {
  const router = useRouter();
  const [current, setCurrent] = useState(stageId);
  const [pending, setPending] = useState<Stage | null>(null);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);

  const flow = stages.filter((s) => !s.isLost);
  const lost = stages.find((s) => s.isLost);
  const currentIndex = flow.findIndex((s) => s.id === current);
  const isLostNow = lost?.id === current;

  async function move(stage: Stage, value?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, stageId: stage.id, lossReason: stage.isLost ? value : undefined, trackingCode: stage.name === "Доставка" ? value : undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Не удалось перевести сделку");
      setCurrent(stage.id);
      setPending(null);
      toast.success(`Этап: ${stage.name}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally { setBusy(false); }
  }

  function pick(stage: Stage) {
    if (stage.id === current || busy) return;
    if (stage.isLost || stage.name === "Доставка") { setExtra(""); setPending(stage); return; }
    void move(stage);
  }

  const cur = stages.find((s) => s.id === current);
  const next = !isLostNow && currentIndex >= 0 ? flow[currentIndex + 1] : undefined;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Текущий этап — кнопка с меню всех этапов */}
      <div className="relative">
        <button type="button" onClick={() => setMenu((v) => !v)} disabled={busy}
          className="flex h-9 items-center gap-2 rounded-xl border border-slate-200/80 bg-white pl-3 pr-2.5 text-[13px] font-medium shadow-sm hover:bg-slate-50 dark:border-white/[.08] dark:bg-[#16181d]">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: cur?.color || "#94a3b8" }} />
          {cur?.name || "Этап"}
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>
        {menu && (
          <div className="absolute left-0 top-full z-30 mt-1 w-60 rounded-xl border bg-white p-1.5 shadow-xl dark:bg-[#1c1f25]" onMouseLeave={() => setMenu(false)}>
            {stages.map((stage) => (
              <button key={stage.id} type="button" onClick={() => { setMenu(false); pick(stage); }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-slate-100 dark:hover:bg-white/[.06] ${stage.id === current ? "font-semibold" : ""} ${stage.isLost ? "text-rose-600" : ""}`}>
                <span className="h-2 w-2 rounded-full" style={{ background: stage.color }} />{stage.name}{stage.isLost ? "…" : ""}
                {stage.id === current && <Check className="ml-auto h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        )}
      </div>
      {next && (
        <button type="button" onClick={() => pick(next)} disabled={busy}
          className="flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-[13px] font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900">
          {next.name}<ArrowRight className="h-4 w-4" />
        </button>
      )}
      {/* Тонкая шкала прогресса по этапам */}
      <div className="hidden min-w-[160px] flex-1 items-center gap-1 sm:flex" aria-hidden>
        {flow.map((stage, i) => (
          <span key={stage.id} title={stage.name} className="h-1.5 flex-1 rounded-full" style={{ background: !isLostNow && currentIndex >= 0 && i <= currentIndex ? (cur?.color || "#0f172a") : "rgba(148,163,184,.25)" }} />
        ))}
      </div>
      {lost && !isLostNow && (
        <button onClick={() => pick(lost)} disabled={busy} className="h-9 shrink-0 rounded-xl px-3 text-[12.5px] font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-700">Отказ…</button>
      )}

      <Dialog open={Boolean(pending)} onOpenChange={(v) => !v && !busy && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{pending?.isLost ? "Почему отказ?" : "Передать в доставку"}</DialogTitle></DialogHeader>
          {pending?.isLost ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {LOSS_REASONS.map((r) => <button key={r} type="button" onClick={() => setExtra(r)} className={`rounded-lg border px-3 py-2 text-left text-sm ${extra === r ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 hover:bg-slate-50"}`}>{r}</button>)}
              </div>
              <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Или своя причина" />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Трек-номер сохранится и уйдёт клиенту в Telegram или на почту.</p>
              <Input autoFocus value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Трек-номер / код отправления" />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>Отмена</Button>
            <Button onClick={() => pending && void move(pending, extra.trim())} disabled={busy || !extra.trim()}>{busy ? "Сохраняю…" : "Сохранить"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
