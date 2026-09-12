"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Circle, Clock3, Loader2, Plus, Search, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Contact = { id: string; name: string; company?: string | null; activeDealId?: string | null; activeDealTitle?: string | null; ownerId?: string | null };
type Member = { id: string; name: string; role: string; active: boolean };
type Task = { id: string; description: string; contactId: string; contactName?: string | null; dealId?: string | null; dealTitle?: string | null; ownerId?: string | null; ownerName?: string | null; priority: string; scheduledAt?: string | null; completedAt?: string | null; createdAt: string };
type Filter = "today" | "overdue" | "upcoming" | "all" | "done";

function localDateTime(hours = 1) {
  const date = new Date(Date.now() + hours * 3600_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
function dayKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function dateLabel(value?: string | null) {
  if (!value) return "Без срока";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<Filter>("today");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ description: "", contactId: "", ownerId: "", priority: "normal", scheduledAt: localDateTime() });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [taskRes, contactRes, teamRes] = await Promise.all([
        fetch("/api/tasks", { cache: "no-store" }), fetch("/api/contacts", { cache: "no-store" }), fetch("/api/team", { cache: "no-store" }),
      ]);
      const [taskData, contactData, teamData] = await Promise.all([taskRes.json(), contactRes.json(), teamRes.json()]);
      if (!taskRes.ok) throw new Error(taskData.error || "Не удалось загрузить задачи");
      setTasks(taskData.tasks || []); setContacts(Array.isArray(contactData) ? contactData : []); setMembers(teamData.members || []);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Ошибка загрузки"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const now = new Date();
  const today = dayKey(now);
  const counts = useMemo(() => ({
    overdue: tasks.filter((task) => !task.completedAt && task.scheduledAt && new Date(task.scheduledAt).getTime() < Date.now()).length,
    today: tasks.filter((task) => !task.completedAt && task.scheduledAt && dayKey(new Date(task.scheduledAt)) === dayKey(new Date())).length,
    upcoming: tasks.filter((task) => !task.completedAt && task.scheduledAt && dayKey(new Date(task.scheduledAt)) > dayKey(new Date())).length,
    done: tasks.filter((task) => Boolean(task.completedAt)).length,
  }), [tasks]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const due = task.scheduledAt ? new Date(task.scheduledAt) : null;
      const isDone = Boolean(task.completedAt);
      const key = due ? dayKey(due) : "";
      const matchesFilter = filter === "all" ? !isDone : filter === "done" ? isDone : filter === "overdue" ? !isDone && Boolean(due && due.getTime() < Date.now()) : filter === "today" ? !isDone && key === today : !isDone && key > today;
      const matchesSearch = !q || [task.description, task.contactName, task.dealTitle, task.ownerName].some((value) => String(value || "").toLowerCase().includes(q));
      return matchesFilter && matchesSearch;
    }).sort((a, b) => Number(new Date(a.scheduledAt || 8640000000000000)) - Number(new Date(b.scheduledAt || 8640000000000000)));
  }, [tasks, filter, search, today]);

  async function createTask() {
    if (!form.description.trim() || !form.contactId) return toast.error("Укажите задачу и клиента");
    setSaving(true);
    try {
      const contact = contacts.find((item) => item.id === form.contactId);
      const response = await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, dealId: contact?.activeDealId || null }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Не удалось создать задачу");
      toast.success("Задача создана"); setShowForm(false); setForm({ description: "", contactId: "", ownerId: "", priority: "normal", scheduledAt: localDateTime() }); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Ошибка создания"); }
    finally { setSaving(false); }
  }

  async function update(id: string, body: Record<string, unknown>) {
    try {
      const response = await fetch(`/api/tasks/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Не удалось обновить задачу"); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Ошибка обновления"); }
  }
  async function remove(id: string) {
    if (!confirm("Удалить задачу?")) return;
    const response = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (response.ok) await load(); else toast.error("Не удалось удалить задачу");
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-5 pb-10">
      <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-slate-400"><CalendarClock className="h-4 w-4" /> Контроль дел</div><h1 className="text-3xl font-semibold tracking-[-.035em] text-slate-950">Задачи</h1><p className="mt-2 text-[15px] leading-6 text-slate-500">Что нужно сделать сегодня, что уже просрочено и кому нельзя забыть ответить.</p></div><Button onClick={() => setShowForm(true)} className="h-11 rounded-xl px-4"><Plus className="mr-2 h-4 w-4" />Новая задача</Button></div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Сегодня" value={counts.today} /><Stat label="Просрочено" value={counts.overdue} danger /><Stat label="Дальше" value={counts.upcoming} /><Stat label="Выполнено" value={counts.done} /></div>

      <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-100 p-4"><div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Задача, клиент, сделка или ответственный" className="h-11 rounded-xl pl-10" /></div><div className="flex gap-1.5 overflow-x-auto">{(["today", "overdue", "upcoming", "all", "done"] as Filter[]).map((item) => <button key={item} onClick={() => setFilter(item)} className={`h-9 shrink-0 rounded-xl px-3 text-xs font-medium ${filter === item ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-500"}`}>{item === "today" ? "Сегодня" : item === "overdue" ? "Просрочено" : item === "upcoming" ? "Предстоящие" : item === "done" ? "Выполнено" : "Все активные"}</button>)}</div></div>
        {loading ? <div className="flex min-h-56 items-center justify-center text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Загрузка…</div> : <div className="divide-y divide-slate-100">{visible.map((task) => {
          const overdue = !task.completedAt && task.scheduledAt && new Date(task.scheduledAt).getTime() < Date.now();
          return <div key={task.id} className={`flex gap-3 p-4 sm:p-5 ${overdue ? "bg-rose-50/30" : ""}`}><button onClick={() => void update(task.id, { completed: !task.completedAt })} className="mt-0.5 text-slate-400 hover:text-emerald-600">{task.completedAt ? <Check className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5" />}</button><div className="min-w-0 flex-1"><div className={`text-sm font-medium ${task.completedAt ? "text-slate-400 line-through" : "text-slate-900"}`}>{task.description}</div><div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400"><Link href={`/contacts/${task.contactId}`} className="font-medium text-slate-600 hover:underline">{task.contactName || "Клиент"}</Link>{task.dealId && <><span>·</span><Link href={`/deals/${task.dealId}`} className="hover:underline">{task.dealTitle || "Сделка"}</Link></>}{task.ownerName && <><span>·</span><span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" />{task.ownerName}</span></>}<Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${task.priority === "urgent" ? "border-rose-200 bg-rose-50 text-rose-700" : task.priority === "high" ? "border-amber-200 bg-amber-50 text-amber-700" : ""}`}>{task.priority === "urgent" ? "Срочно" : task.priority === "high" ? "Важно" : task.priority === "low" ? "Низкий" : "Обычный"}</Badge></div></div><div className="flex shrink-0 items-start gap-2"><div className={`whitespace-nowrap text-[11px] ${overdue ? "font-semibold text-rose-600" : "text-slate-400"}`}><Clock3 className="mr-1 inline h-3 w-3" />{dateLabel(task.scheduledAt)}</div><button onClick={() => void remove(task.id)} className="rounded-lg p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div></div>;
        })}{!visible.length && <div className="p-12 text-center text-sm text-slate-400">В этом разделе задач нет.</div>}</div>}
      </section>

      {showForm && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl"><h2 className="text-xl font-semibold text-slate-950">Новая задача</h2><div className="mt-5 space-y-4"><div><label className="mb-1.5 block text-xs font-medium text-slate-600">Что сделать</label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Например: отправить финальный расчёт" className="h-11 rounded-xl" /></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Клиент"><select value={form.contactId} onChange={(e) => { const contact = contacts.find((item) => item.id === e.target.value); setForm((f) => ({ ...f, contactId: e.target.value, ownerId: f.ownerId || contact?.ownerId || "" })); }} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Выберите клиента</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.company ? ` · ${contact.company}` : ""}</option>)}</select></Field><Field label="Ответственный"><select value={form.ownerId} onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Я / текущий пользователь</option>{members.filter((m) => m.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Срок"><Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))} className="h-11 rounded-xl" /></Field><Field label="Приоритет"><select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="low">Низкий</option><option value="normal">Обычный</option><option value="high">Важно</option><option value="urgent">Срочно</option></select></Field></div></div><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setShowForm(false)} className="rounded-xl">Отмена</Button><Button onClick={() => void createTask()} disabled={saving} className="rounded-xl">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Создать</Button></div></div></div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="mb-1.5 block text-xs font-medium text-slate-600">{label}</label>{children}</div>; }
function Stat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) { return <div className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm"><div className={`text-[11px] ${danger ? "text-rose-600" : "text-slate-400"}`}>{label}</div><div className={`mt-1 text-2xl font-semibold ${danger && value ? "text-rose-700" : "text-slate-950"}`}>{value}</div></div>; }
