"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Status = "new" | "work" | "ignore" | "contractor";

/** Статус обращения прямо в диалоге: «Новое» → «В работу» → карточка в воронке. */
export function InboxStatus({ channel, threadId, contactId, title, onChanged }: {
  channel: "email" | "telegram"; threadId?: string | null; contactId?: string | null; title: string; onChanged?: () => void;
}) {
  const [state, setState] = useState<{ status: Status; stageName: string | null; dealId: string | null }>({ status: "new", stageName: null, dealId: null });
  const [busy, setBusy] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!contactId) { setState({ status: "new", stageName: null, dealId: null }); return; }
    fetch(`/api/inbox/status?contactId=${encodeURIComponent(contactId)}`, { cache: "no-store" }).then((r) => r.json()).then((d) => { if (!cancelled) setState(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [contactId, threadId]);

  async function set(status: Status) {
    if (status === state.status || busy) return;
    setBusy(status);
    try {
      const res = await fetch("/api/inbox/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, channel, threadId, contactId, title }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Не удалось изменить статус");
      setState({ status: d.status, stageName: d.stageName, dealId: d.dealId });
      toast.success(status === "work" ? `Взято в работу${d.stageName ? ` · ${d.stageName}` : ""}` : status === "ignore" ? "Отмечено: не клиент" : status === "contractor" ? "Перенесено в «Подрядчики»" : "Снова новое обращение");
      onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); }
    finally { setBusy(null); }
  }

  const options: Array<[Status, string, string]> = [
    ["new", "Новое", "bg-white text-slate-900 shadow-sm"],
    ["work", "В работу", "bg-emerald-600 text-white shadow-sm"],
    ["ignore", "Не клиент", "bg-slate-700 text-white shadow-sm"],
    ["contractor", "Подрядчик", "bg-sky-600 text-white shadow-sm"],
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg bg-muted p-0.5" role="group" aria-label="Статус обращения">
        {options.map(([value, label, active]) => (
          <button key={value} type="button" onClick={() => void set(value)} disabled={Boolean(busy)}
            className={`inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium transition sm:px-2.5 ${state.status === value ? active : "text-muted-foreground hover:text-foreground"}`}>
            {busy === value && <Loader2 className="h-3 w-3 animate-spin" />}{label}
          </button>
        ))}
      </div>
      {state.dealId && (
        <Link href={`/deals/${state.dealId}`} className="text-xs text-muted-foreground hover:text-foreground hover:underline">{state.stageName || "сделка"} →</Link>
      )}
    </div>
  );
}
