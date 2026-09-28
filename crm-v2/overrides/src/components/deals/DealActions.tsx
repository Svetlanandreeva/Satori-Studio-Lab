"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DealDialog, type DealDraft } from "./DealDialog";

export async function deleteDeals(ids: string[]) {
  const res = ids.length === 1
    ? await fetch(`/api/deals/${ids[0]}`, { method: "DELETE" })
    : await fetch("/api/deals", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Не удалось удалить");
  return data;
}

export function ConfirmDelete({ open, title, text, onCancel, onConfirm, busy }: {
  open: boolean; title: string; text: string; busy?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-sm leading-6 text-muted-foreground">{text}</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>Отмена</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>{busy ? "Удаляю…" : "Удалить"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Кнопки «Изменить» и «Удалить» в шапке карточки сделки. */
export function DealHeaderActions({ deal }: { deal: DealDraft & { id: string; title: string } }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await deleteDeals([deal.id]);
      toast.success("Сделка удалена");
      router.push("/deals");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => setEditOpen(true)} className="rounded-xl"><Pencil className="mr-1.5 h-4 w-4" />Изменить</Button>
      <Button variant="outline" onClick={() => setConfirm(true)} className="rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700" aria-label="Удалить сделку"><Trash2 className="h-4 w-4" /></Button>
      <DealDialog open={editOpen} onClose={() => setEditOpen(false)} initial={deal} />
      <ConfirmDelete open={confirm} busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void remove()}
        title="Удалить сделку?"
        text={`«${deal.title}» пропадёт из воронки вместе с её закупками и историей этапов. Клиент и переписка останутся.`} />
    </div>
  );
}

/** Универсальная кнопка «Новая сделка» (можно заранее задать клиента или этап). */
export function NewDealButton({ contactId, contactName, stageId, label = "Новая сделка", variant = "default", className = "" }: {
  contactId?: string; contactName?: string; stageId?: string; label?: string;
  variant?: "default" | "outline" | "ghost"; className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} className={`rounded-xl ${className}`}><Plus className="mr-1.5 h-4 w-4" />{label}</Button>
      <DealDialog open={open} onClose={() => setOpen(false)} initial={{ contactId, contactName, stageId }} />
    </>
  );
}
