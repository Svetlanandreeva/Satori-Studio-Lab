"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Edit3,
  FolderKanban,
  Loader2,
  Search,
  Truck,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ProjectRow {
  dealId: string;
  title: string;
  dealValue: number;
  contactId: string;
  contactName: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  stageName: string;
  calculationEnteredAt: number;
  isStoreOrder: boolean;
  orderedAt: string | null;
  productionTermDays: number | null;
  contractDeadline: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  paymentTerms: string | null;
  projectNotes: string | null;
  receivedAmount: number;
  totalCost: number;
  profit: number;
  margin: number;
  unpaid: number;
  productionDays: number | null;
  deliveryDays: number | null;
  deadlineStatus: "no_deadline" | "overdue" | "due_today" | "due_soon" | "on_track" | "shipped_late" | "shipped";
  daysRemaining: number | null;
  overdueDays: number;
}

interface ProjectForm {
  paymentTerms: string;
  orderedAt: string;
  productionTermDays: string;
  shippedAt: string;
  notes: string;
}

const emptyForm: ProjectForm = { paymentTerms: "", orderedAt: "", productionTermDays: "", shippedAt: "", notes: "" };

function rubles(cents: number): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 })
    .format((Number(cents) || 0) / 100);
}

function percent(value: number): string {
  return `${(Number(value) || 0).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

function paymentProgress(received: number, total: number): string {
  if (!total || total <= 0) return rubles(received);
  const value = Math.max(0, Math.min(100, Math.round((received / total) * 100)));
  return `${rubles(received)} · ${value}%`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("ru-RU").format(new Date(year, month - 1, day));
}

function addDays(date: string, days: number): string | null {
  if (!date || !Number.isFinite(days) || days <= 0) return null;
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.getTime())) return null;
  value.setUTCDate(value.getUTCDate() + Math.round(days));
  return value.toISOString().slice(0, 10);
}

function deadlineLabel(project: ProjectRow): string {
  switch (project.deadlineStatus) {
    case "overdue": return `Просрочка ${project.overdueDays} дн.`;
    case "due_today": return "Отправить сегодня";
    case "due_soon":
    case "on_track": return `Осталось ${project.daysRemaining} дн.`;
    case "shipped_late": return `Отправлено с просрочкой ${project.overdueDays} дн.`;
    case "shipped": return "Отправлено в срок";
    default: return "Нет дедлайна";
  }
}

function deadlineClass(project: ProjectRow): string {
  if (["overdue", "due_today"].includes(project.deadlineStatus)) return "border-red-300 bg-red-50 text-red-700";
  if (["due_soon", "shipped_late"].includes(project.deadlineStatus)) return "border-amber-300 bg-amber-50 text-amber-700";
  if (["on_track", "shipped"].includes(project.deadlineStatus)) return "border-emerald-300 bg-emerald-50 text-emerald-700";
  return "border-slate-300 bg-slate-50 text-slate-600";
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось загрузить проекты");
      setProjects(payload.projects || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка загрузки проектов");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openProject = (project: ProjectRow) => {
    setEditing(project);
    setForm({
      paymentTerms: project.paymentTerms || "",
      orderedAt: project.orderedAt || "",
      productionTermDays: project.productionTermDays ? String(project.productionTermDays) : "",
      shippedAt: project.shippedAt || "",
      notes: project.projectNotes || "",
    });
  };

  const previewDeadline = useMemo(
    () => addDays(form.orderedAt, Number(form.productionTermDays)),
    [form.orderedAt, form.productionTermDays]
  );

  const saveProject = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const response = await fetch("/api/projects", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dealId: editing.dealId,
          paymentTerms: form.paymentTerms || null,
          orderedAt: form.orderedAt || null,
          productionTermDays: form.productionTermDays || null,
          shippedAt: form.shippedAt || null,
          notes: form.notes,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось сохранить проект");
      toast.success("Условия проекта сохранены");
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения проекта");
    } finally {
      setSaving(false);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) =>
      [project.title, project.contactName, project.company, project.phone, project.email, project.stageName, project.paymentTerms]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [projects, search]);

  const stats = useMemo(() => ({
    active: projects.filter((project) => !project.shippedAt).length,
    overdue: projects.filter((project) => project.deadlineStatus === "overdue").length,
    dueSoon: projects.filter((project) => ["due_today", "due_soon"].includes(project.deadlineStatus)).length,
    shipped: projects.filter((project) => Boolean(project.shippedAt)).length,
  }), [projects]);

  if (loading && projects.length === 0) {
    return <div className="flex min-h-80 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Загрузка проектов...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2"><FolderKanban className="h-6 w-6" /><h1 className="text-2xl font-bold tracking-tight">Проекты</h1></div>
          <p className="mt-1 text-sm text-muted-foreground">Срок изготовления считается до отгрузки. После «Отправлен» доставка идёт отдельным счётчиком.</p>
        </div>
        <div className="relative w-full xl:w-96">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Проект, клиент, телефон..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon={<Clock3 className="h-4 w-4" />} label="Активных" value={stats.active} />
        <Stat icon={<AlertTriangle className="h-4 w-4" />} label="Просрочено" value={stats.overdue} tone="text-red-700" />
        <Stat icon={<CalendarClock className="h-4 w-4" />} label="Горят сроки" value={stats.dueSoon} tone="text-amber-700" />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Отправлено" value={stats.shipped} tone="text-emerald-700" />
      </div>

      <div className="space-y-4">
        {visible.map((project) => (
          <Card key={project.dealId} className={project.deadlineStatus === "overdue" ? "border-red-200" : ""}>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{project.title}</CardTitle>
                    <Badge variant="outline">{project.stageName}</Badge>
                    {project.isStoreOrder && <Badge variant="outline">Сайт · 7 дней</Badge>}
                    <Badge variant="outline" className={deadlineClass(project)}>{deadlineLabel(project)}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    <Link href={`/contacts/${project.contactId}`} className="font-medium text-foreground hover:underline">{project.contactName}</Link>
                    {project.company ? ` · ${project.company}` : ""}{project.phone ? ` · ${project.phone}` : ""}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => openProject(project)}><Edit3 className="mr-2 h-4 w-4" /> Условия и сроки</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                <Info label="Дата оплаты" value={formatDate(project.orderedAt)} />
                <Info label="Срок производства" value={project.productionTermDays ? `${project.productionTermDays} дн.` : "—"} />
                <Info label="Отправить до" value={formatDate(project.contractDeadline)} />
                <Info label="Отправлено" value={formatDate(project.shippedAt)} />
                <Info label="Дней производства" value={project.productionDays === null ? "—" : String(project.productionDays)} />
                <Info label="Осталось" value={project.daysRemaining === null ? "—" : `${project.daysRemaining} дн.`} />
                <Info label="Просрочка" value={project.overdueDays ? `${project.overdueDays} дн.` : "0 дн."} danger={project.overdueDays > 0} />
                <Info label="Сумма проекта" value={rubles(project.dealValue)} />
              </div>

              {project.isStoreOrder && (
                <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    {project.shippedAt ? (
                      <>
                        <span className="font-medium">Производство закрыто {formatDate(project.shippedAt)}.</span>
                        <span className="text-muted-foreground">
                          Доставка: {project.deliveryDays ?? 0} дн.{project.deliveredAt ? ` · завершена ${formatDate(project.deliveredAt)}` : " · в пути"}
                        </span>
                      </>
                    ) : (
                      <span><b>Заказ с сайта:</b> 7 календарных дней от оплаты до отгрузки. Доставка в эти 7 дней не входит.</span>
                    )}
                  </div>
                </div>
              )}

              {project.paymentTerms && (
                <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Условия оплаты: </span>
                  <span className="font-medium">{project.paymentTerms}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-5">
                <div><div className="flex items-center gap-1 text-xs text-muted-foreground"><WalletCards className="h-3.5 w-3.5" /> Расчёт</div><div className="mt-1 font-semibold">{rubles(project.dealValue)}</div></div>
                <Info label="Получено" value={paymentProgress(project.receivedAmount, project.dealValue)} />
                <Info label="Расходы" value={rubles(project.totalCost)} />
                <Info label="Прибыль" value={rubles(project.profit)} danger={project.profit < 0} />
                <Info label="Маржа" value={percent(project.margin)} danger={project.profit < 0} />
              </div>

              {project.projectNotes && <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">{project.projectNotes}</div>}
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Link href={`/contacts/${project.contactId}`} className="text-sm font-medium hover:underline">Карточка заказчика</Link><span className="text-muted-foreground">·</span>
                <Link href="/economics" className="text-sm font-medium hover:underline">Открыть экономику</Link>
                {project.shippedAt && <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground"><Truck className="h-4 w-4" /> отправлено {formatDate(project.shippedAt)}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
        {visible.length === 0 && <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">Активных проектов пока нет.</CardContent></Card>}
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Условия проекта</DialogTitle>
            <DialogDescription>
              {editing ? `${editing.contactName} · ${editing.title}. ` : ""}
              {editing?.isStoreOrder
                ? "Заказ с сайта: дата оплаты приходит автоматически, срок изготовления фиксирован — 7 календарных дней. При статусе «Отправлен» производство останавливается, дальше считается доставка."
                : "Для договора укажи условия, дату платежа и срок производства — дедлайн посчитается сам."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="payment-terms">Условия оплаты</Label>
            <textarea id="payment-terms" value={form.paymentTerms} onChange={(event) => setForm((current) => ({ ...current, paymentTerms: event.target.value }))} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Например: 100% предоплата или 50% перед запуском + 50% перед отгрузкой" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DateField label="Дата платежа" value={form.orderedAt} onChange={(value) => setForm((current) => ({ ...current, orderedAt: value }))} disabled={Boolean(editing?.isStoreOrder)} />
            <div className="space-y-2">
              <Label>Срок производства, дней</Label>
              <Input type="number" min={1} max={3650} value={form.productionTermDays} onChange={(event) => setForm((current) => ({ ...current, productionTermDays: event.target.value }))} placeholder="Например, 14" disabled={Boolean(editing?.isStoreOrder)} />
            </div>
            <div className="space-y-2">
              <Label>Рассчитанный дедлайн</Label>
              <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm">{formatDate(previewDeadline)}</div>
            </div>
            <DateField label="Фактически отправлено" value={form.shippedAt} onChange={(value) => setForm((current) => ({ ...current, shippedAt: value }))} />
          </div>
          {editing?.isStoreOrder && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Для заказа с сайта дата отправки фиксируется автоматически при смене статуса на «Отправлен клиенту». Поле можно скорректировать вручную только при необходимости.
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="project-notes">Информация по проекту</Label>
            <textarea id="project-notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Материалы, подрядчик, доставка, номер договора и другие детали..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Отмена</Button>
            <Button onClick={saveProject} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ icon, label, value, tone = "" }: { icon: React.ReactNode; label: string; value: number; tone?: string }) {
  return <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div><div className={`mt-2 text-2xl font-bold ${tone}`}>{value}</div></CardContent></Card>;
}

function Info({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="min-w-0"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 truncate text-sm font-medium ${danger ? "text-red-700" : ""}`}>{value}</div></div>;
}

function DateField({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type="date" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} /></div>;
}