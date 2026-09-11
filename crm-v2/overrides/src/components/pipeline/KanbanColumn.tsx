"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { DealCard } from "./DealCard";
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
}

interface KanbanColumnProps {
  id: string;
  name: string;
  color: string;
  deals: Deal[];
}

export function KanbanColumn({ id, name, color, deals }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const totalValue = deals.reduce((sum, deal) => sum + deal.value, 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[280px] w-[280px] rounded-lg bg-muted/50 transition-colors ${isOver ? "bg-muted" : ""}`}
    >
      <div className="flex items-center gap-2 p-3 border-b">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <h3 className="text-sm font-semibold flex-1 truncate">{name}</h3>
        <span className="text-xs text-muted-foreground bg-background rounded-full px-2 py-0.5">
          {deals.length}
        </span>
      </div>

      <div className="p-2 text-xs text-muted-foreground text-center border-b">
        {formatCurrency(totalValue)}
      </div>

      <SortableContext items={deals.map((deal) => deal.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 p-2 space-y-2 min-h-[100px] overflow-y-auto">
          {deals.map((deal) => (
            <DealCard key={deal.id} {...deal} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
