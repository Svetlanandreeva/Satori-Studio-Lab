"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { QualificationBadge } from "@/components/shared/QualificationBadge";
import { formatCurrency } from "@/lib/constants";
import {
  LEAD_QUALIFICATION_OPTIONS,
  type LeadQualification,
} from "@/lib/lead-qualification";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import type { Temperature } from "@/types";

interface DealCardProps {
  id: string;
  title: string;
  value: number;
  contactId: string;
  contactName: string | null;
  contactTemperature: string | null;
  contactQualification: string | null;
  probability: number;
  readOnly?: boolean;
}

export function DealCard({
  id,
  title,
  value,
  contactId,
  contactName,
  contactTemperature,
  contactQualification,
  probability,
  readOnly = false,
}: DealCardProps) {
  const router = useRouter();
  const [qualification, setQualification] = useState<LeadQualification>(
    (contactQualification || "new") as LeadQualification
  );
  const [busy, setBusy] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: readOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const changeQualification = async (next: LeadQualification) => {
    if (readOnly || busy || next === qualification) return;
    const previous = qualification;
    setQualification(next);
    setBusy(true);
    try {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qualification: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось изменить квалификацию");
      const label = LEAD_QUALIFICATION_OPTIONS.find((item) => item.value === next)?.label || next;
      toast.success(`Лид: ${label}`);
      window.location.reload();
    } catch (error) {
      setQualification(previous);
      toast.error(error instanceof Error ? error.message : "Ошибка квалификации");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
    >
      <div className="space-y-2">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-primary">{formatCurrency(value)}</span>
          {contactTemperature && (
            <StatusBadge temperature={contactTemperature as Temperature} size="sm" />
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
          <button
            type="button"
            className="truncate text-left hover:text-foreground hover:underline"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              router.push(`/contacts/${contactId}`);
            }}
          >
            {contactName || "Без клиента"}
          </button>
          <span>{probability}%</span>
        </div>

        <div
          className="pt-2 border-t space-y-1.5"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Квалификация</span>
            <QualificationBadge qualification={qualification} className="text-[10px]" />
          </div>
          {!readOnly && (
            <select
              value={qualification}
              disabled={busy}
              onChange={(event) => changeQualification(event.target.value as LeadQualification)}
              className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              aria-label="Квалификация лида"
            >
              {LEAD_QUALIFICATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </Card>
  );
}
