"use client";

import { useState, useCallback, useRef } from "react";
import {
  DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, type DragOverEvent, type DragCancelEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "./KanbanColumn";
import { DealCard } from "./DealCard";
import { toast } from "sonner";
import type { PipelineColumn } from "@/types";

interface KanbanBoardProps { initialColumns: PipelineColumn[]; }
interface PendingShipment { dealId: string; stageId: string; dealTitle: string; }
interface PendingLoss { dealId: string; stageId: string; dealTitle: string; }

const LOSS_REASONS = ["Дорого", "Не подошли сроки", "Клиент пропал", "Выбрал конкурента", "Передумал / отменил", "Не нашлось подходящего решения", "Другое"];

export function KanbanBoard({ initialColumns }: KanbanBoardProps) {
  const [columns, setColumns] = useState(initialColumns);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingShipment, setPendingShipment] = useState<PendingShipment | null>(null);
  const [pendingLoss, setPendingLoss] = useState<PendingLoss | null>(null);
  const [trackingCode, setTrackingCode] = useState("");
  const [lossReason, setLossReason] = useState("");
  const [saving, setSaving] = useState(false);
  const columnsSnapshot = useRef<PipelineColumn[]>(initialColumns);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const activeDeal = activeId ? columns.flatMap((col) => col.deals).find((deal) => deal.id === activeId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    columnsSnapshot.current = columns;
  }, [columns]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const activeColumn = columns.find((col) => col.deals.some((deal) => deal.id === activeId));
    const overColumn = columns.find((col) => col.id === overId) || columns.find((col) => col.deals.some((deal) => deal.id === overId));
    if (!activeColumn || !overColumn || activeColumn.id === overColumn.id) return;

    setColumns((previous) => {
      const sourceColumn = previous.find((col) => col.deals.some((deal) => deal.id === activeId));
      const targetColumn = previous.find((col) => col.id === overColumn.id) || overColumn;
      const movingDeal = sourceColumn?.deals.find((deal) => deal.id === activeId);
      if (!sourceColumn || !targetColumn || !movingDeal || sourceColumn.id === targetColumn.id) return previous;
      return previous.map((column) => {
        if (column.id === sourceColumn.id) return { ...column, deals: column.deals.filter((deal) => deal.id !== activeId) };
        if (column.id === targetColumn.id) return { ...column, deals: [...column.deals, { ...movingDeal, stageId: column.id }] };
        return column;
      });
    });
  }, [columns]);

  const commitMove = useCallback(async (dealId: string, stageId: string, options?: { trackingCode?: string; lossReason?: string }) => {
    const response = await fetch("/api/pipeline", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId, stageId, trackingCode: options?.trackingCode || undefined, lossReason: options?.lossReason || undefined }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `Ошибка ${response.status}`);
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

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) { setColumns(columnsSnapshot.current); return; }
    const dealId = active.id as string;
    const targetColumn = columns.find((column) => column.id === over.id) || columns.find((column) => column.deals.some((deal) => deal.id === over.id));
    if (!targetColumn) { setColumns(columnsSnapshot.current); return; }
    const originalColumn = columnsSnapshot.current.find((column) => column.deals.some((deal) => deal.id === dealId));
    if (originalColumn?.id === targetColumn.id) return;
    const deal = columnsSnapshot.current.flatMap((column) => column.deals).find((item) => item.id === dealId) as any;

    if (targetColumn.name === "Доставка") {
      setTrackingCode("");
      setPendingShipment({ dealId, stageId: targetColumn.id, dealTitle: deal?.title || "Заказ" });
      return;
    }
    if ((targetColumn as any).isLost) {
      setLossReason("");
      setPendingLoss({ dealId, stageId: targetColumn.id, dealTitle: deal?.title || "Сделка" });
      return;
    }
    try { await commitMove(dealId, targetColumn.id); }
    catch (error) {
      setColumns(columnsSnapshot.current);
      toast.error(error instanceof Error ? `Не удалось переместить сделку: ${error.message}` : "Не удалось переместить сделку");
    }
  }, [columns, commitMove]);

  const confirmShipment = useCallback(async () => {
    if (!pendingShipment) return;
    const code = trackingCode.trim();
    if (!code) return toast.error("Укажите трек-номер / код отправления");
    setSaving(true);
    try {
      await commitMove(pendingShipment.dealId, pendingShipment.stageId, { trackingCode: code });
      setPendingShipment(null); setTrackingCode("");
    } catch (error) {
      setColumns(columnsSnapshot.current); toast.error(error instanceof Error ? error.message : "Не удалось оформить доставку"); setPendingShipment(null);
    } finally { setSaving(false); }
  }, [pendingShipment, trackingCode, commitMove]);

  const confirmLoss = useCallback(async () => {
    if (!pendingLoss || !lossReason.trim()) return toast.error("Выберите или укажите причину отказа");
    setSaving(true);
    try {
      await commitMove(pendingLoss.dealId, pendingLoss.stageId, { lossReason: lossReason.trim() });
      toast.success("Причина отказа сохранена"); setPendingLoss(null); setLossReason("");
    } catch (error) {
      setColumns(columnsSnapshot.current); toast.error(error instanceof Error ? error.message : "Не удалось оформить отказ"); setPendingLoss(null);
    } finally { setSaving(false); }
  }, [pendingLoss, lossReason, commitMove]);

  const cancelDialog = useCallback(() => {
    setColumns(columnsSnapshot.current); setPendingShipment(null); setPendingLoss(null); setTrackingCode(""); setLossReason("");
  }, []);
  const handleDragCancel = useCallback((_event: DragCancelEvent) => { setActiveId(null); setColumns(columnsSnapshot.current); }, []);

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => <KanbanColumn key={column.id} id={column.id} name={column.name} color={column.color} deals={column.deals.map((deal: any) => ({
            id: deal.id, title: deal.title, value: deal.value, contactId: deal.contactId,
            contactName: deal.contactName || deal.contact?.name || null,
            contactTemperature: deal.contactTemperature || deal.contact?.temperature || null,
            contactQualification: deal.contactQualification || deal.contact?.qualification || "new",
            probability: deal.probability, ownerName: deal.ownerName || null,
          })) as any} />)}
        </div>
        <DragOverlay>{activeDeal ? <DealCard id={activeDeal.id} title={activeDeal.title} value={activeDeal.value} contactId={activeDeal.contactId} contactName={(activeDeal as any).contactName || (activeDeal as any).contact?.name || null} contactTemperature={(activeDeal as any).contactTemperature || (activeDeal as any).contact?.temperature || null} contactQualification={(activeDeal as any).contactQualification || (activeDeal as any).contact?.qualification || "new"} probability={activeDeal.probability} ownerName={(activeDeal as any).ownerName || null} readOnly /> : null}</DragOverlay>
      </DndContext>

      {pendingShipment && <Modal title="Передать в доставку" subtitle={pendingShipment.dealTitle} onCancel={cancelDialog}>
        <p className="text-sm leading-6 text-slate-500">Введите код отправления. CRM сохранит его, остановит счётчик производства и отправит клиенту в Telegram, а если чата нет — на email.</p>
        <label className="mt-5 block text-sm font-medium text-slate-700">Трек-номер / код отправления</label>
        <input autoFocus value={trackingCode} onChange={(e) => setTrackingCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !saving) void confirmShipment(); if (e.key === "Escape" && !saving) cancelDialog(); }} placeholder="Например, 8057 1234 5678" className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base outline-none focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100" />
        <Actions cancel={cancelDialog} confirm={() => void confirmShipment()} saving={saving} disabled={!trackingCode.trim()} label="Сохранить и отправить клиенту" />
      </Modal>}

      {pendingLoss && <Modal title="Почему сделка потеряна?" subtitle={pendingLoss.dealTitle} onCancel={cancelDialog}>
        <p className="text-sm leading-6 text-slate-500">Причина нужна для аналитики — потом будет видно, где именно теряются продажи.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {LOSS_REASONS.map((reason) => <button key={reason} type="button" onClick={() => setLossReason(reason)} className={`rounded-xl border px-3 py-2 text-left text-xs transition ${lossReason === reason ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{reason}</button>)}
        </div>
        <input value={lossReason} onChange={(e) => setLossReason(e.target.value)} placeholder="Или напишите свою причину" className="mt-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200" />
        <Actions cancel={cancelDialog} confirm={() => void confirmLoss()} saving={saving} disabled={!lossReason.trim()} label="Сохранить отказ" />
      </Modal>}
    </>
  );
}

function Modal({ title, subtitle, children, onCancel }: { title: string; subtitle: string; children: React.ReactNode; onCancel: () => void }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}><div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"><div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">{title}</div><h2 className="text-xl font-semibold text-slate-950">{subtitle}</h2>{children}</div></div>;
}
function Actions({ cancel, confirm, saving, disabled, label }: { cancel: () => void; confirm: () => void; saving: boolean; disabled: boolean; label: string }) {
  return <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={cancel} disabled={saving} className="h-11 rounded-2xl border border-slate-200 px-5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Отмена</button><button type="button" onClick={confirm} disabled={saving || disabled} className="h-11 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Сохраняем…" : label}</button></div>;
}
