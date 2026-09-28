"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PackageCheck, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Step = { id: string; key: string; title: string; done: boolean; sortOrder: number };
type Project = {
  dealId: string; title: string; contactId: string; contactName: string; company?: string | null; stageName: string;
  contractDeadline?: string | null; deadlineStatus?: string; daysRemaining?: number | null; overdueDays?: number;
  shippedAt?: string | null; trackingCode?: string; checklist: Step[]; checklistProgress: number; isStoreOrder?: boolean;
};

function deadlineText(project: Project) {
  if (project.deadlineStatus === "overdue") return `Просрочка ${project.overdueDays || 0} дн.`;
  if (project.deadlineStatus === "due_today") return "Срок сегодня";
  if (project.deadlineStatus === "due_soon") return `Осталось ${project.daysRemaining || 0} дн.`;
  if (project.shippedAt) return "Передано в доставку";
  return project.contractDeadline ? `До ${project.contractDeadline}` : "Без дедлайна";
}

export default function ProductionPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

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
    return projects.filter((project) => {
      if (["Завершено", "Отказ"].includes(project.stageName)) return false;
      if (!q) return true;
      return [project.title, project.contactName, project.company, project.stageName, project.trackingCode].filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
    });
  }, [projects, search]);

  const stats = useMemo(() => ({
    active: visible.length,
    risk: visible.filter((item) => ["overdue", "due_today", "due_soon"].includes(String(item.deadlineStatus))).length,
    ready: visible.filter((item) => item.checklistProgress === 100).length,
  }), [visible]);

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

  if (loading && !projects.length) return <div className="flex min-h-80 items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Загрузка производства…</div>;

  return (
    <div className="mx-auto max-w-[1480px] space-y-5 pb-10">
      <section className="flex flex-col gap-4 rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-7">
        <div><div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-slate-400"><PackageCheck className="h-4 w-4" /> Операционный контроль</div><h1 className="text-3xl font-semibold tracking-[-.035em] text-slate-950">Производство</h1><p className="mt-2 max-w-2xl text-[15px] leading-6 text-slate-500">По каждому заказу видно, что уже сделано: макет, согласование, закупка, производство, обработка, проверка и упаковка.</p></div>
        <div className="relative w-full sm:w-80"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Проект или клиент" className="h-11 rounded-xl pl-10" /></div>
      </section>

      <div className="grid grid-cols-3 gap-3"><Stat label="В работе" value={stats.active} /><Stat label="Требуют внимания" value={stats.risk} warning /><Stat label="Готовы по чек-листу" value={stats.ready} /></div>

      <div className="grid gap-4 xl:grid-cols-2">
        {visible.map((project) => {
          const risk = ["overdue", "due_today", "due_soon"].includes(String(project.deadlineStatus));
          return <Card key={project.dealId} className={`rounded-[24px] shadow-sm ${risk ? "border-amber-300" : "border-slate-200/80"}`}>
            <CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="truncate text-base"><Link href={`/deals/${project.dealId}`} className="hover:underline">{project.title}</Link></CardTitle><div className="mt-1 text-sm text-slate-500"><Link href={`/contacts/${project.contactId}`} className="font-medium text-slate-700 hover:underline">{project.contactName}</Link>{project.company ? ` · ${project.company}` : ""}</div></div><div className="flex flex-wrap gap-2"><Badge variant="outline">{project.stageName}</Badge><Badge variant="outline" className={risk ? "border-amber-300 bg-amber-50 text-amber-700" : ""}>{deadlineText(project)}</Badge></div></div></CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-950 transition-all" style={{ width: `${project.checklistProgress}%` }} /></div><span className="w-10 text-right text-xs font-semibold text-slate-700">{project.checklistProgress}%</span></div>
              <div className="grid gap-2 sm:grid-cols-2">{project.checklist.map((step) => {
                const itemBusy = busy === `${project.dealId}:${step.key}`;
                return <button key={step.key} type="button" onClick={() => void toggle(project, step)} disabled={itemBusy} className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition ${step.done ? "border-emerald-200 bg-emerald-50/70 text-emerald-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{itemBusy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : step.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <span className="h-4 w-4 shrink-0 rounded border border-slate-300" />}<span>{step.title}</span></button>;
              })}</div>
              {project.trackingCode && <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">Трек: <span className="font-medium text-slate-700">{project.trackingCode}</span></div>}
            </CardContent>
          </Card>;
        })}
      </div>
      {!visible.length && <div className="rounded-[24px] border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">Активных производственных проектов по этому фильтру нет.</div>}
    </div>
  );
}

function Stat({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return <div className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm"><div className={`flex items-center gap-1.5 text-[11px] ${warning ? "text-amber-600" : "text-slate-400"}`}>{warning && <AlertTriangle className="h-3.5 w-3.5" />}{label}</div><div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{value}</div></div>;
}
