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
  type DragCancelEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "./KanbanColumn";
import { DealCard } from "./DealCard";
import { toast } from "sonner";
import type { PipelineColumn } from "@/types";

interface KanbanBoardProps {
  initialColumns: PipelineColumn[];
}

interface PendingShipment {
  dealId: string;
  stageId: string;
  dealTitle: string;
}

export function KanbanBoard({ initialColumns }: KanbanBoardProps) {
  const [columns, setColumns] = useState(initialColumns);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingShipment, setPendingShipment] = useState<PendingShipment | null>(null);
  const [trackingCode, setTrackingCode] = useState("");
  const [savingShipment, setSavingShipment] = useState(false);
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
      const activeColumn = columns.find((col) =>
        col.deals.some((deal) => deal.id === activeId)
      );
      const overColumn =
        columns.find((col) => col.id === overId) ||
        columns.find((col) => col.deals.some((deal) => deal.id === overId));
      if (!activeColumn || !overColumn || activeColumn.id === overColumn.id) return;

      setColumns((previous) => {
        const sourceColumn = previous.find((col) =>
          col.deals.some((deal) => deal.id === activeId)
        );
        const targetColumn =
          previous.find((col) => col.id === overColumn.id) || overColumn;
        const activeDeal = sourceColumn?.deals.find((deal) => deal.id === activeId);
        if (!sourceColumn || !targetColumn || !activeDeal) return previous;
        if (sourceColumn.id === targetColumn.id) return previous;

        return previous.map((column) => {
          if (column.id === sourceColumn.id) {
            return {
              ...column,
              deals: column.deals.filter((deal) => deal.id !== activeId),
            };
          }
          if (column.id === targetColumn.id) {
            return {
              ...column,
              deals: [...column.deals, { ...activeDeal, stageId: column.id }],
            };
          }
          return column;
        });
      });
    },
    [columns]
  );

  const commitMove = useCallback(async (dealId: string, stageId: string, code?: string) => {
    const response = await fetch("/api/pipeline", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId, stageId, trackingCode: code || undefined }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || `Ошибка ${response.status}`);
    }
    if (data?.shipment?.notification) {
      const notification = data.shipment.notification;
      if (notification.sent) {
        const channel = notification.channel === "telegram" ? "Telegram" : notification.channel === "email" ? "email" : "канал клиента";
        toast.success(`Трек-номер сохранён и отправлен клиенту через ${channel}`);
      } else if (notification.needsManual) {
        toast.warning(`Трек-номер сохранён, но уведомление не отправлено: ${notification.error || "отправьте клиенту вручную"}`);
      }
    }
    return data;
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over) {
        setColumns(columnsSnapshot.current);
        return;
      }

      const dealId = active.id as string;
      const targetColumn =
        columns.find((column) => column.id === over.id) ||
        columns.find((column) => column.deals.some((deal) => deal.id === over.id));

      if (!targetColumn) {
        setColumns(columnsSnapshot.current);
        return;
      }

      const originalColumn = columnsSnapshot.current.find((column) =>
        column.deals.some((deal) => deal.id === dealId)
      );
      if (originalColumn?.id === targetColumn.id) return;

      const deal = columnsSnapshot.current
        .flatMap((column) => column.deals)
        .find((item) => item.id === dealId);

      if (targetColumn.name === "Доставка") {
        setTrackingCode("");
        setPendingShipment({
          dealId,
          stageId: targetColumn.id,
          dealTitle: deal?.title || "Заказ",
        });
        return;
      }

      try {
        await commitMove(dealId, targetColumn.id);
      } catch (error) {
        setColumns(columnsSnapshot.current);
        toast.error(
          error instanceof Error
            ? `Не удалось переместить сделку: ${error.message}`
            : "Не удалось переместить сделку. Изменение отменено."
        );
      }
    },
    [columns, commitMove]
  );

  const confirmShipment = useCallback(async () => {
    if (!pendingShipment) return;
    const code = trackingCode.trim();
    if (!code) {
      toast.error("Укажите трек-номер / код отправления");
      return;
    }
    setSavingShipment(true);
    try {
      await commitMove(pendingShipment.dealId, pendingShipment.stageId, code);
      setPendingShipment(null);
      setTrackingCode("");
    } catch (error) {
      setColumns(columnsSnapshot.current);
      toast.error(error instanceof Error ? error.message : "Не удалось оформить доставку");
      setPendingShipment(null);
    } finally {
      setSavingShipment(false);
    }
  }, [pendingShipment, trackingCode, commitMove]);

  const cancelShipment = useCallback(() => {
    setColumns(columnsSnapshot.current);
    setPendingShipment(null);
    setTrackingCode("");
  }, []);

  const handleDragCancel = useCallback((_event: DragCancelEvent) => {
    setActiveId(null);
    setColumns(columnsSnapshot.current);
  }, []);

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
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

      {pendingShipment ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">Передать в доставку</div>
            <h2 className="text-xl font-semibold text-slate-950">{pendingShipment.dealTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Введите код отправления. CRM сохранит его, остановит счётчик производства и отправит клиенту в Telegram, а если чата нет — на email.
            </p>
            <label className="mt-5 block text-sm font-medium text-slate-700">Трек-номер / код отправления</label>
            <input
              autoFocus
              value={trackingCode}
              onChange={(event) => setTrackingCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !savingShipment) void confirmShipment();
                if (event.key === "Escape" && !savingShipment) cancelShipment();
              }}
              placeholder="Например, 8057 1234 5678"
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelShipment}
                disabled={savingShipment}
                className="h-11 rounded-2xl border border-slate-200 px-5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void confirmShipment()}
                disabled={savingShipment || !trackingCode.trim()}
                className="h-11 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {savingShipment ? "Отправляем…" : "Сохранить и отправить клиенту"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
