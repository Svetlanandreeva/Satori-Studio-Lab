"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArchiveRestore, CheckCircle2, Database, HardDrive, HeartPulse, Loader2, Mail, Merge, MessageSquareText, Plus, RefreshCw, Save, ServerCog, ShieldCheck, Trash2, UserRound, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Actor = { id: string; name: string; role: "owner" | "manager" | "viewer" };
type HealthItem = { ok: boolean; message: string; [key: string]: unknown };
type Health = { overall: boolean; checkedAt: string; statuses: Record<string, HealthItem> };
type Backup = { name: string; size: number; createdAt: number };
type Member = { id: string; name: string; login: string | null; role: string; active: boolean };
type Template = { id: string; title: string; channel: string; body: string; sortOrder: number };
type Contact = { id: string; name: string; email?: string | null; phone?: string | null; company?: string | null };
type Audit = { id: string; actorName?: string | null; action: string; entityType: string; entityId?: string | null; details?: string | null; createdAt: number };

const statusLabels: Record<string, string> = { database: "База данных", email: "Почта", telegram: "Telegram", needNumber: "Need Number", scheduler: "Фоновые задачи", backups: "Резервные копии", disk: "Диск" };
const actionLabels: Record<string, string> = { create_team_member: "Добавлен сотрудник", update_team_member: "Изменён сотрудник", delete_team_member: "Удалён сотрудник", move_deal: "Сделка перемещена", update_deal: "Сделка изменена", delete_deal: "Сделка удалена", create_task: "Создана задача", complete_task: "Задача выполнена", update_task: "Задача изменена", delete_task: "Задача удалена", merge_contacts: "Клиенты объединены", create_template: "Создан шаблон", update_template: "Изменён шаблон", delete_template: "Удалён шаблон", create_backup: "Создан backup", restore_backup: "Запрошено восстановление", update_production_checklist: "Обновлено производство" };

function date(value: number | string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(d); }
function size(value: number) { return value > 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(value / 1024))} КБ`; }

export default function ControlPage() {
  const [actor, setActor] = useState<Actor | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState({ name: "", login: "", password: "", role: "manager" });
  const [templateForm, setTemplateForm] = useState({ title: "", channel: "all", body: "" });
  const [mergeSource, setMergeSource] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");

  const load = useCallback(async () => {
    const [meRes, healthRes, teamRes, templateRes, contactRes, auditRes] = await Promise.all([
      fetch("/api/auth/me", { cache: "no-store" }), fetch("/api/control/health", { cache: "no-store" }), fetch("/api/team", { cache: "no-store" }), fetch("/api/templates", { cache: "no-store" }), fetch("/api/contacts", { cache: "no-store" }), fetch("/api/control/audit?limit=40", { cache: "no-store" }),
    ]);
    const [me, h, team, templ, contact, log] = await Promise.all([meRes.json(), healthRes.json(), teamRes.json(), templateRes.json(), contactRes.json(), auditRes.json()]);
    if (meRes.ok) setActor(me.actor || null); if (healthRes.ok) setHealth(h); if (teamRes.ok) setMembers(team.members || []); if (templateRes.ok) setTemplates(templ.templates || []); if (contactRes.ok) setContacts(Array.isArray(contact) ? contact : []); if (auditRes.ok) setAudit(log.events || []);
    if (me.actor?.role === "owner") {
      const backupRes = await fetch("/api/control/backups", { cache: "no-store" });
      const backupData = await backupRes.json(); if (backupRes.ok) setBackups(backupData.backups || []);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const roleLabel = actor?.role === "owner" ? "Владелец" : actor?.role === "manager" ? "Менеджер" : "Просмотр";
  const sourceContact = contacts.find((item) => item.id === mergeSource);
  const targetContact = contacts.find((item) => item.id === mergeTarget);
  const canManageTeam = actor?.role === "owner";
  const canEdit = actor?.role !== "viewer";

  async function createBackup() {
    setBusy("backup");
    try { const r = await fetch("/api/control/backups", { method: "POST" }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Не удалось создать backup"); toast.success("Резервная копия создана"); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка backup"); } finally { setBusy(null); }
  }
  async function restoreBackup(name: string) {
    if (!confirm(`Восстановить CRM из ${name}? Текущая база будет заменена, сервис перезапустится.`)) return;
    setBusy(`restore:${name}`);
    try { const r = await fetch("/api/control/backups", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Не удалось восстановить"); toast.success("Восстановление запущено. CRM перезапустится."); setTimeout(() => window.location.reload(), 2500); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка восстановления"); } finally { setBusy(null); }
  }
  async function createMember() {
    if (!memberForm.name || !memberForm.login || !memberForm.password) return toast.error("Заполните имя, логин и пароль");
    setBusy("member");
    try { const r = await fetch("/api/team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(memberForm) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Не удалось добавить сотрудника"); setMemberForm({ name: "", login: "", password: "", role: "manager" }); toast.success("Сотрудник добавлен"); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); } finally { setBusy(null); }
  }
  async function toggleMember(member: Member) {
    try { const r = await fetch("/api/team", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: member.id, active: !member.active }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Не удалось изменить сотрудника"); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); }
  }
  async function removeMember(id: string) {
    if (!confirm("Удалить сотрудника?")) return;
    const r = await fetch(`/api/team?id=${encodeURIComponent(id)}`, { method: "DELETE" }); const d = await r.json(); if (!r.ok) return toast.error(d.error || "Не удалось удалить"); await load();
  }
  async function createTemplate() {
    if (!templateForm.title.trim() || !templateForm.body.trim()) return toast.error("Заполните название и текст");
    setBusy("template");
    try { const r = await fetch("/api/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(templateForm) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Не удалось создать шаблон"); setTemplateForm({ title: "", channel: "all", body: "" }); toast.success("Шаблон добавлен"); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); } finally { setBusy(null); }
  }
  async function removeTemplate(id: string) { if (!confirm("Удалить шаблон?")) return; const r = await fetch(`/api/templates?id=${encodeURIComponent(id)}`, { method: "DELETE" }); const d = await r.json(); if (!r.ok) return toast.error(d.error || "Не удалось удалить"); await load(); }
  async function merge() {
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget) return toast.error("Выберите двух разных клиентов");
    if (!confirm(`Объединить «${sourceContact?.name}» в «${targetContact?.name}»? Сделки, история, переписка и документы перейдут к клиенту-получателю.`)) return;
    setBusy("merge");
    try { const r = await fetch("/api/contacts/merge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceId: mergeSource, targetId: mergeTarget }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Не удалось объединить"); setMergeSource(""); setMergeTarget(""); toast.success("Клиенты объединены"); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка объединения"); } finally { setBusy(null); }
  }

  return (
    <div className="mx-auto max-w-[1480px] space-y-5 pb-10">
      <section className="flex flex-col gap-4 rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-7"><div><div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-slate-400"><ServerCog className="h-4 w-4" /> Администрирование CRM</div><h1 className="text-3xl font-semibold tracking-[-.035em] text-slate-950">Контроль</h1><p className="mt-2 max-w-2xl text-[15px] leading-6 text-slate-500">Состояние интеграций, резервные копии, сотрудники, шаблоны сообщений, дубли клиентов и журнал важных изменений.</p></div><div className="flex items-center gap-2"><Badge variant="outline"><UserRound className="mr-1 h-3 w-3" />{actor?.name || "…"}</Badge><Badge>{roleLabel}</Badge><Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-3.5 w-3.5" />Обновить</Button></div></section>

      <section className="rounded-[24px] border border-slate-200/80 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="flex items-center gap-2 text-base font-semibold"><HeartPulse className="h-4 w-4" />Состояние системы</h2><p className="mt-1 text-xs text-slate-400">Проверка базы, почты, Telegram, Need Number, фоновых задач, backups и диска</p></div>{health && <Badge className={health.overall ? "bg-emerald-600" : "bg-amber-600"}>{health.overall ? "Всё работает" : "Нужно внимание"}</Badge>}</div><div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">{health ? Object.entries(health.statuses).map(([key, item]) => <div key={key} className={`rounded-2xl border p-4 ${item.ok ? "border-emerald-100 bg-emerald-50/40" : "border-amber-200 bg-amber-50/60"}`}><div className="flex items-center gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-lg ${item.ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{item.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}</span><span className="text-sm font-semibold text-slate-800">{statusLabels[key] || key}</span></div><div className="mt-2 text-xs text-slate-500">{item.message}</div></div>) : <div className="col-span-full flex items-center justify-center py-10 text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Проверяем…</div>}</div><div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">Подключения меняются в <Link href="/settings" className="font-medium text-slate-700 hover:underline">Настройках</Link>. Фоновые уведомления о задачах и сроках приходят в Telegram даже когда CRM закрыта.</div></section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-[24px] border border-slate-200/80 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="flex items-center gap-2 text-base font-semibold"><Database className="h-4 w-4" />Резервные копии</h2><p className="mt-1 text-xs text-slate-400">Автоматически раз в день · хранение 30 дней</p></div>{actor?.role === "owner" && <Button size="sm" onClick={() => void createBackup()} disabled={busy === "backup"}>{busy === "backup" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HardDrive className="mr-2 h-4 w-4" />}Создать сейчас</Button>}</div><div className="p-5">{actor?.role !== "owner" ? <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500"><ShieldCheck className="mb-2 h-5 w-5" />Скачивание и восстановление резервных копий доступно только владельцу.</div> : !backups.length ? <div className="py-8 text-center text-sm text-slate-400">Backup создастся автоматически или по кнопке выше.</div> : <div className="max-h-72 space-y-2 overflow-y-auto">{backups.slice(0, 20).map((backup) => <div key={backup.name} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"><ArchiveRestore className="h-4 w-4 text-slate-400" /><div className="min-w-0 flex-1"><div className="truncate text-xs font-medium text-slate-800">{backup.name}</div><div className="mt-0.5 text-[10px] text-slate-400">{date(backup.createdAt)} · {size(backup.size)}</div></div><a href={`/api/control/backups?download=${encodeURIComponent(backup.name)}`}><Button variant="ghost" size="sm">Скачать</Button></a><Button variant="ghost" size="sm" onClick={() => void restoreBackup(backup.name)} disabled={busy === `restore:${backup.name}`} className="text-amber-700">Восстановить</Button></div>)}</div>}</div></section>

        <section className="rounded-[24px] border border-slate-200/80 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="flex items-center gap-2 text-base font-semibold"><Users className="h-4 w-4" />Сотрудники и роли</h2><p className="mt-1 text-xs text-slate-400">Владелец · менеджер · только просмотр</p></div><div className="space-y-4 p-5">{members.map((member) => <div key={member.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><UserRound className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{member.name}</span><Badge variant="outline" className="text-[10px]">{member.role === "owner" ? "Владелец" : member.role === "viewer" ? "Просмотр" : "Менеджер"}</Badge>{!member.active && <Badge variant="secondary" className="text-[10px]">Отключён</Badge>}</div><div className="text-[11px] text-slate-400">{member.login ? `логин: ${member.login}` : "основной вход владельца"}</div></div>{canManageTeam && member.id !== "owner" && <><Button variant="outline" size="sm" onClick={() => void toggleMember(member)}>{member.active ? "Отключить" : "Включить"}</Button><Button variant="ghost" size="icon" onClick={() => void removeMember(member.id)}><Trash2 className="h-4 w-4" /></Button></>}</div>)}{canManageTeam && <div className="rounded-2xl bg-slate-50 p-4"><div className="mb-3 text-xs font-semibold text-slate-700">Добавить сотрудника</div><div className="grid gap-2 sm:grid-cols-2"><Input placeholder="Имя" value={memberForm.name} onChange={(e) => setMemberForm((f) => ({ ...f, name: e.target.value }))} /><Input placeholder="Логин" value={memberForm.login} onChange={(e) => setMemberForm((f) => ({ ...f, login: e.target.value }))} /><Input type="password" placeholder="Пароль от 8 символов" value={memberForm.password} onChange={(e) => setMemberForm((f) => ({ ...f, password: e.target.value }))} /><select className="h-10 rounded-md border bg-white px-3 text-sm" value={memberForm.role} onChange={(e) => setMemberForm((f) => ({ ...f, role: e.target.value }))}><option value="manager">Менеджер</option><option value="viewer">Только просмотр</option><option value="owner">Владелец</option></select></div><Button size="sm" className="mt-3" onClick={() => void createMember()} disabled={busy === "member"}><Plus className="mr-2 h-4 w-4" />Добавить</Button></div>}</div></section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-[24px] border border-slate-200/80 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="flex items-center gap-2 text-base font-semibold"><MessageSquareText className="h-4 w-4" />Шаблоны сообщений</h2><p className="mt-1 text-xs text-slate-400">Доступны прямо в переписке одним нажатием</p></div><div className="space-y-3 p-5">{templates.map((template) => <div key={template.id} className="rounded-xl border border-slate-100 p-3"><div className="flex items-center gap-2"><span className="flex-1 text-sm font-medium text-slate-800">{template.title}</span><Badge variant="outline" className="text-[10px]">{template.channel === "all" ? "Все каналы" : template.channel === "email" ? "Email" : "Telegram"}</Badge>{canEdit && <button onClick={() => void removeTemplate(template.id)} className="rounded p-1 text-slate-300 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}</div><div className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-slate-500">{template.body}</div></div>)}{canEdit && <div className="rounded-2xl bg-slate-50 p-4"><div className="grid gap-2 sm:grid-cols-[1fr_140px]"><Input placeholder="Название шаблона" value={templateForm.title} onChange={(e) => setTemplateForm((f) => ({ ...f, title: e.target.value }))} /><select className="h-10 rounded-md border bg-white px-3 text-sm" value={templateForm.channel} onChange={(e) => setTemplateForm((f) => ({ ...f, channel: e.target.value }))}><option value="all">Все каналы</option><option value="email">Email</option><option value="telegram">Telegram</option></select></div><textarea value={templateForm.body} onChange={(e) => setTemplateForm((f) => ({ ...f, body: e.target.value }))} placeholder="Текст сообщения" rows={3} className="mt-2 w-full resize-y rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200" /><Button size="sm" className="mt-2" onClick={() => void createTemplate()} disabled={busy === "template"}><Save className="mr-2 h-4 w-4" />Добавить шаблон</Button></div>}</div></section>

        <section className="rounded-[24px] border border-slate-200/80 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="flex items-center gap-2 text-base font-semibold"><Merge className="h-4 w-4" />Объединить дубли клиентов</h2><p className="mt-1 text-xs text-slate-400">Переносит сделки, активности, переписку и документы в одну карточку</p></div><div className="space-y-4 p-5"><div><label className="mb-1.5 block text-xs font-medium text-slate-600">Дубль, который нужно убрать</label><select value={mergeSource} onChange={(e) => setMergeSource(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Выберите клиента</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.email || contact.phone || contact.company || "без контакта"}</option>)}</select></div><div><label className="mb-1.5 block text-xs font-medium text-slate-600">Основной клиент, которого оставить</label><select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Выберите клиента</option>{contacts.filter((contact) => contact.id !== mergeSource).map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.email || contact.phone || contact.company || "без контакта"}</option>)}</select></div>{mergeSource && mergeTarget && <div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">«{sourceContact?.name}» будет удалён как отдельная карточка. Все связанные данные перейдут к «{targetContact?.name}».</div>}<Button onClick={() => void merge()} disabled={!canEdit || busy === "merge" || !mergeSource || !mergeTarget} className="rounded-xl">{busy === "merge" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Merge className="mr-2 h-4 w-4" />}Объединить</Button></div></section>
      </div>

      <section className="rounded-[24px] border border-slate-200/80 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="flex items-center gap-2 text-base font-semibold"><Activity className="h-4 w-4" />Журнал изменений</h2><p className="mt-1 text-xs text-slate-400">Кто и что менял в CRM</p></div><div className="divide-y divide-slate-100">{audit.map((event) => <div key={event.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[160px_180px_1fr]"><div className="text-[11px] text-slate-400">{date(event.createdAt)}</div><div className="text-xs font-medium text-slate-600">{event.actorName || "Система"}</div><div className="text-xs text-slate-700">{actionLabels[event.action] || event.action}{event.entityId ? <span className="ml-2 text-slate-400">#{event.entityId.slice(0, 8)}</span> : null}</div></div>)}{!audit.length && <div className="p-10 text-center text-sm text-slate-400">Журнал начнёт заполняться после изменений.</div>}</div></section>
    </div>
  );
}
