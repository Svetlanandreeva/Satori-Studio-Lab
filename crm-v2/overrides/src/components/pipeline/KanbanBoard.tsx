"use client";

import { useState, useCallback, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "./KanbanColumn";
import { DealCard } from "./DealCard";
import { toast } from "sonner";
import type { PipelineColumn } from "@/types";

interface KanbanBoardProps {
  initialColumns: PipelineColumn[];
}

export function KanbanBoard({ initialColumns }: KanbanBoardProps) {
  const [columns, setColumns] = useState(initialColumns);
  const [activeId, setActiveId] = useState<string | null>(null);
  const columnsSnapshot = useRef<PipelineColumn[]>(initialColumns);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const activeDeal = activeId
    ? columns.flatMap((col) => col.deals).find((deal) => deal.id === activeId)
    : null;

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(event.active.id as string);
      columnsSnapshot.current = columns;
    },
    [columns]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeId = active.id as string;
      const overId = over.id as string;
      const activeColumn = columns.find((col) => col.deals.some((deal) => deal.id === activeId));
      const overColumn =
        columns.find((col) => col.id === overId) ||
        columns.find((col) => col.deals.some((deal) => deal.id === overId));
      if (!activeColumn || !overColumn || activeColumn.id === overColumn.id) return;

      setColumns((previous) => {
        const activeDeal = activeColumn.deals.find((deal) => deal.id === activeId);
        if (!activeDeal) return previous;
        return previous.map((column) => {
          if (column.id === activeColumn.id) {
            return { ...column, deals: column.deals.filter((deal) => deal.id !== activeId) };
          }
          if (column.id === overColumn.id) {
            return { ...column, deals: [...column.deals, { ...activeDeal, stageId: column.id }] };
          }
          return column;
        });
      });
    },
    [columns]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over) return;
      const activeId = active.id as string;
      const overColumn =
        columns.find((column) => column.id === over.id) ||
        columns.find((column) => column.deals.some((deal) => deal.id === over.id));
      if (!overColumn) return;

      try {
        const response = await fetch("/api/pipeline", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dealId: activeId, stageId: overColumn.id }),
        });
        if (!response.ok) throw new Error("API error");
      } catch {
        setColumns(columnsSnapshot.current);
        toast.error("Не удалось переместить сделку. Изменение отменено.");
      }
    },
    [columns]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            id={column.id}
            name={column.name}
            color={column.color}
            deals={column.deals.map((deal) => ({
              id: deal.id,
              title: deal.title,
              value: deal.value,
              contactId: deal.contactId,
              contactName: deal.contactName || (deal.contact?.name ?? null),
              contactTemperature:
                deal.contactTemperature || (deal.contact?.temperature ?? null),
              contactQualification:
                deal.contactQualification || (deal.contact?.qualification ?? "new"),
              probability: deal.probability,
            }))}
          />
        ))}
      </div>

      <DragOverlay>
        {activeDeal ? (
          <DealCard
            id={activeDeal.id}
            title={activeDeal.title}
            value={activeDeal.value}
            contactId={activeDeal.contactId}
            contactName={activeDeal.contactName || (activeDeal.contact?.name ?? null)}
            contactTemperature={
              activeDeal.contactTemperature || (activeDeal.contact?.temperature ?? null)
            }
            contactQualification={
              activeDeal.contactQualification || (activeDeal.contact?.qualification ?? "new")
            }
            probability={activeDeal.probability}
            readOnly
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
