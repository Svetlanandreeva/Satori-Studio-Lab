"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Stage = { id: string; name: string; color: string; isWon: boolean; isLost: boolean };

const LOSS_REASONS = ["Дорого", "Не подошли сроки", "Клиент пропал", "Выбрал конкурента", "Передумал", "Другое"];

/** Этапы сделки одной строкой: видно, где сделка сейчас, и можно перевести кликом. */
export function DealStageBar({ dealId, stageId, stages }: { dealId: string; stageId: string; stages: Stage[] }) {
  const router = useRouter();
  const [current, setCurrent] = useState(stageId);
  const [pending, setPending] = useState<Stage | null>(null);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-white p-1 dark:border-white/[.08] dark:bg-[#16181d]">
        {flow.map((stage, i) => {
          const done = !isLostNow && currentIndex >= 0 && i < currentIndex;
          const active = stage.id === current;
          return (
            <button key={stage.id} onClick={() => pick(stage)} disabled={busy} title={active ? "Текущий этап" : `Перевести в «${stage.name}»`}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition ${active ? "text-white shadow-sm" : done ? "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[.05]" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[.05]"}`}
              style={active ? { background: stage.color || "#0f172a" } : undefined}>
              {done && <Check className="h-3.5 w-3.5" />}{stage.name}
            </button>
          );
        })}
      </div>
      {lost && (
        <button onClick={() => pick(lost)} disabled={busy || isLostNow}
          className={`shrink-0 rounded-xl border px-3 py-2 text-[12.5px] font-medium ${isLostNow ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-white/[.08]"}`}>
          {isLostNow ? "Отказ" : "Отказ…"}
        </button>
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
