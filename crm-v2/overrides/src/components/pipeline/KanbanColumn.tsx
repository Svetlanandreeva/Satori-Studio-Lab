"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { DealCard } from "./DealCard";
import { DealDialog } from "@/components/deals/DealDialog";
import { formatCurrency } from "@/lib/constants";

interface Deal {
  id: string;
  title: string;
  value: number;
  contactId: string;
  contactName: string | null;
  contactTemperature: string | null;
  contactQualification: string | null;
  probability: number;
  ownerName?: string | null;
  deadline?: string | null;
  shippedAt?: string | null;
  isWon?: boolean;
}

interface KanbanColumnProps {
  id: string;
  name: string;
  color: string;
  isLost?: boolean;
  deals: Deal[];
}

export function KanbanColumn({ id, name, color, isLost, deals }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [adding, setAdding] = useState(false);
  const totalValue = deals.reduce((sum, deal) => sum + Math.max(0, deal.value), 0); // -1 = сумма скрыта (сделка коллеги)

  return (
    <div
      ref={setNodeRef}
      className={`flex max-h-full w-[248px] min-w-[248px] flex-col rounded-2xl border border-transparent bg-slate-100/80 transition-colors dark:bg-white/[.03] ${isOver ? "border-violet-300 bg-violet-50/70 dark:bg-violet-500/10" : ""}`}
    >
      <div className="flex items-center gap-2 px-3 pb-1 pt-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">{name}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-500 dark:bg-white/[.08]">{deals.length}</span>
        {!isLost && (
          <button type="button" onClick={() => setAdding(true)} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-900 dark:hover:bg-white/[.08] dark:hover:text-white" aria-label={`Новая сделка в «${name}»`} title="Новая сделка на этом этапе">
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="px-3 pb-2 text-[11px] text-slate-400">{deals.some((d) => d.value < 0) ? (totalValue ? `мои ${formatCurrency(totalValue)}` : "") : formatCurrency(totalValue)}</div>

      <SortableContext items={deals.map((deal) => deal.id)} strategy={verticalListSortingStrategy}>
        <div className="min-h-[120px] flex-1 space-y-2 overflow-y-auto px-2 pb-2">
          {deals.map((deal) => (
            <DealCard key={deal.id} {...deal} />
          ))}
          {!deals.length && <div className="rounded-xl border border-dashed border-slate-300/70 px-3 py-6 text-center text-[11px] text-slate-400 dark:border-white/[.08]">Перетащи сюда сделку</div>}
        </div>
      </SortableContext>
      <DealDialog open={adding} onClose={() => setAdding(false)} initial={{ stageId: id }} />
    </div>
  );
}
