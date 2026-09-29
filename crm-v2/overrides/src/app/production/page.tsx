"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { deadlineBadge } from "@/components/deals/DealMoneyDates";
import { ProjectPanel } from "@/components/production/ProjectPanel";

type Step = { id: string; key: string; title: string; done: boolean; sortOrder: number };
type Project = {
  dealId: string; title: string; contactId: string; contactName: string; company?: string | null; stageName: string;
  orderedAt?: string | null; productionTermDays?: number | null; contractDeadline?: string | null; shippedAt?: string | null;
  productionDays?: number | null; checklist: Step[]; checklistProgress: number;
  directCost?: number; profit?: number; receivedAmount?: number;
};

const short = (d: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00Z`));
const long = (d: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "short" }).format(new Date(`${d}T12:00:00Z`));
const toneClass = { red: "bg-rose-50 text-rose-700 ring-rose-200", amber: "bg-amber-50 text-amber-800 ring-amber-200", green: "bg-emerald-50 text-emerald-700 ring-emerald-200" };

export default function ProductionPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [panel, setPanel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/production", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить производство");
      setProjects(data.projects || []);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Ошибка загрузки"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects
      .filter((p) => !q || [p.title, p.contactName, p.company].some((v) => String(v || "").toLowerCase().includes(q)))
      // Сначала ближайшие дедлайны, в конце — без сроков.
      .sort((a, b) => String(a.contractDeadline || "9999").localeCompare(String(b.contractDeadline || "9999")));
  }, [projects, search]);

  const overdue = visible.filter((p) => deadlineBadge(p.contractDeadline || null, p.shippedAt || null)?.tone === "red").length;
  const noDates = visible.filter((p) => !p.contractDeadline).length;

  async function toggle(project: Project, step: Step) {
    const key = `${project.dealId}:${step.key}`;
    setBusy(key);
    try {
      const response = await fetch("/api/production", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ dealId: project.dealId, key: step.key, done: !step.done }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить");
      const checklist = data.checklist as Step[];
      const completed = checklist.filter((item) => item.done).length;
      setProjects((current) => current.map((item) => item.dealId === project.dealId ? { ...item, checklist, checklistProgress: checklist.length ? Math.round((completed / checklist.length) * 100) : 0 } : item));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Ошибка сохранения"); }
    finally { setBusy(null); }
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Производство</h1>
        <span className="text-sm text-slate-500">{visible.length} в работе</span>
        {overdue > 0 && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">горят сроки: {overdue}</span>}
        {noDates > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">без сроков: {noDates}</span>}
        <div className="relative ml-auto w-full sm:w-64"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Проект или клиент" className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-[13px] outline-none dark:border-white/[.08] dark:bg-transparent" /></div>
      </div>

      {loading && !projects.length ? (
        <div className="flex min-h-60 items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Загрузка…</div>
      ) : !visible.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-white/[.08] dark:bg-[#16181d]">Сейчас нет сделок на этапе «В производстве».<br /><span className="text-slate-400">Переведи сделку в этот этап в воронке — она появится здесь.</span></div>
      ) : (
        <div className="space-y-2">
          {visible.map((p) => {
            const badge = deadlineBadge(p.contractDeadline || null, p.shippedAt || null);
            const expanded = open === p.dealId;
            return (
              <div key={p.dealId} className={`rounded-2xl border bg-white shadow-sm dark:bg-[#16181d] ${badge?.tone === "red" ? "border-rose-200" : "border-slate-200/80 dark:border-white/[.08]"}`}>
                <div className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_210px_170px_32px]">
                  <div className="min-w-0">
                    <button type="button" onClick={() => setPanel(p.dealId)} className="block max-w-full truncate text-left text-[15px] font-medium text-slate-900 hover:underline dark:text-white">{p.title}</button>
                    <div className="truncate text-[12.5px] text-slate-500">{p.contactName}{p.company ? ` · ${p.company}` : ""}</div>
                  </div>
                  <div>
                    {p.contractDeadline ? (
                      <>
                        <div className="text-[14px] font-semibold text-slate-900 dark:text-white">до {long(p.contractDeadline)}</div>
                        {badge && <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${toneClass[badge.tone]}`}>{badge.text}</span>}
                      </>
                    ) : (
                      <button type="button" onClick={() => setPanel(p.dealId)} className="text-left text-[13px] font-medium text-violet-700 hover:underline">Указать дату оплаты и срок →</button>
                    )}
                  </div>
                  <div className="text-[12px] leading-5 text-slate-500">
                    {p.orderedAt ? <>оплата {short(p.orderedAt)}{p.productionTermDays ? ` · ${p.productionTermDays} дн.` : ""}<br />в работе {p.productionDays ?? 0} дн.</> : <span className="text-slate-400">оплата не отмечена</span>}
                    <br /><button type="button" onClick={() => setPanel(p.dealId)} className="font-medium text-slate-700 hover:underline dark:text-slate-300">затраты {new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format((Number(p.directCost) || 0) / 100)} →</button>
                  </div>
                  <button onClick={() => setOpen(expanded ? null : p.dealId)} className="hidden h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 sm:flex" aria-label="Чек-лист"><ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} /></button>
                </div>
                <button onClick={() => setOpen(expanded ? null : p.dealId)} className="flex w-full items-center gap-3 px-4 pb-3 text-left">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[.06]"><div className="h-full rounded-full bg-slate-900 dark:bg-white" style={{ width: `${p.checklistProgress}%` }} /></div>
                  <span className="text-[11px] text-slate-500">чек-лист {p.checklistProgress}%</span>
                </button>
                {expanded && (
                  <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-4 py-3 dark:border-white/[.06]">
                    {p.checklist.map((step) => {
                      const itemBusy = busy === `${p.dealId}:${step.key}`;
                      return <button key={step.key} type="button" onClick={() => void toggle(p, step)} disabled={itemBusy} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] transition ${step.done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/[.08]"}`}>{itemBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : step.done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <span className="h-3.5 w-3.5 rounded border border-slate-300" />}{step.title}</button>;
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <ProjectPanel dealId={panel} onClose={() => setPanel(null)} onChanged={() => void load()} />
    </div>
  );
}
