"use client";

import { useRouter } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { UserRound } from "lucide-react";
import { formatCurrency } from "@/lib/constants";
import { deadlineBadge } from "@/components/deals/DealMoneyDates";

interface DealCardProps {
  id: string;
  title: string;
  value: number;
  contactId: string;
  contactName: string | null;
  contactTemperature: string | null;
  contactQualification?: string | null;
  probability?: number;
  ownerName?: string | null;
  deadline?: string | null;
  shippedAt?: string | null;
  isWon?: boolean;
  readOnly?: boolean;
}

const tempDot: Record<string, string> = { hot: "bg-rose-500", warm: "bg-amber-400", cold: "bg-slate-300" };
const tempLabel: Record<string, string> = { hot: "Горячий", warm: "Тёплый", cold: "Холодный" };

export function DealCard({ id, title, value, contactName, contactTemperature, ownerName, deadline, shippedAt, isWon, readOnly = false }: DealCardProps) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: readOnly });
  const badge = !isWon ? deadlineBadge(deadline || null, shippedAt || null) : null;
  const badgeClass = badge?.tone === "red" ? "bg-rose-50 text-rose-700" : badge?.tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600";
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => { if (!readOnly) router.push(`/deals/${id}`); }}
      className="cursor-pointer select-none rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-slate-300 hover:shadow-md active:cursor-grabbing dark:border-white/[.08] dark:bg-[#1b1d23]"
    >
      <div className="line-clamp-2 text-[13px] font-medium leading-snug text-slate-900 dark:text-white">{title || "Без названия"}</div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="truncate text-[12px] text-slate-500">{contactName || "Без клиента"}</span>
        {contactTemperature && <span className={`h-2 w-2 shrink-0 rounded-full ${tempDot[contactTemperature] || "bg-slate-300"}`} title={tempLabel[contactTemperature] || ""} />}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold tabular-nums text-slate-900 dark:text-white">{value ? formatCurrency(value) : <span className="font-normal text-slate-400">сумма не указана</span>}</span>
        {badge && deadline && <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ${badgeClass}`} title={badge.text}>до {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${deadline}T12:00:00Z`))}</span>}
        {!badge && ownerName && <span className="flex min-w-0 items-center gap-1 text-[11px] text-slate-400"><UserRound className="h-3 w-3 shrink-0" /><span className="truncate">{ownerName}</span></span>}
      </div>
    </div>
  );
}
