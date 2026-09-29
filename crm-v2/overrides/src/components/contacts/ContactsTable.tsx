"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/deals/DealActions";
import { Search, Download, Mail, Phone, Users, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LEAD_QUALIFICATION_OPTIONS, type LeadQualification } from "@/lib/lead-qualification";
import type { Contact } from "@/types";
import { Avatar } from "@/components/inbox/InboxParts";

interface ExtendedContact extends Contact {
  activeDealId?: string | null;
  activeDealTitle?: string | null;
  activeDealValue?: number;
  stageId?: string | null;
  stageName?: string | null;
  stageIsWon?: boolean;
  stageIsLost?: boolean;
  ownerId?: string | null;
  ownerName?: string | null;
}
interface ContactsTableProps { contacts: ExtendedContact[]; onChanged?: () => void; }

const sourceLabels: Record<string, string> = {
  need_number: "Парсер", website: "Сайт", order: "Сайт", ads: "Реклама", email: "Почта", telegram: "Telegram-бот",
  telegram_account: "Telegram", instagram: "Instagram", linkedin: "LinkedIn", referral: "Рекомендация", other: "Другое", otro: "Другое",
};
const qualificationLabels: Record<string, string> = Object.fromEntries(LEAD_QUALIFICATION_OPTIONS.map((x) => [x.value, x.label]));

export function ContactsTable({ contacts, onChanged }: ContactsTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function remove(ids: string[]) {
    setBusy(true);
    try {
      const res = ids.length === 1
        ? await fetch(`/api/contacts/${ids[0]}`, { method: "DELETE" })
        : await fetch("/api/contacts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Не удалось удалить");
      toast.success(ids.length === 1 ? "Клиент удалён" : `Удалено клиентов: ${ids.length}`);
      setSelected(new Set()); setConfirm(null); onChanged?.(); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Не удалось удалить"); }
    finally { setBusy(false); }
  }
  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const [search, setSearch] = useState("");
  const [filterQualification, setFilterQualification] = useState<LeadQualification | "">("");
  const [filterStage, setFilterStage] = useState("");

  const stages = useMemo(() => Array.from(new Set(contacts.map((item) => item.stageName).filter(Boolean) as string[])).sort(), [contacts]);
  const filtered = useMemo(() => contacts.filter((c) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [c.name, c.email, c.company, c.phone, c.activeDealTitle, c.stageName, c.ownerName].some((v) => String(v || "").toLowerCase().includes(q));
    return matchesSearch && (!filterQualification || c.qualification === filterQualification) && (!filterStage || c.stageName === filterStage);
  }), [contacts, search, filterQualification, filterStage]);

  if (!contacts.length) {
    return <div className="rounded-2xl border border-slate-200/80 bg-white px-6 py-16 text-center shadow-sm"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100"><Users className="h-5 w-5 text-slate-500" /></div><h2 className="mt-4 font-semibold text-slate-900">Пока нет клиентов</h2><p className="mx-auto mt-1 max-w-sm text-sm leading-5 text-slate-500">Клиенты появятся из заявок или после ручного добавления из переписки.</p></div>;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
      <div className="space-y-2 border-b border-slate-100 p-3 dark:border-white/[.06]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск: имя, телефон, email, сделка" className="h-9 rounded-xl border-slate-200 bg-slate-50/60 pl-10" /></div>
          <Button variant="ghost" size="sm" onClick={() => window.open("/api/export?type=contacts")} className="h-10 rounded-xl px-3 text-xs text-slate-400"><Download className="mr-1.5 h-3.5 w-3.5" /> Экспорт</Button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <select value={filterQualification} onChange={(e) => setFilterQualification(e.target.value as LeadQualification | "")} className="h-9 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none"><option value="">Все статусы лида</option>{LEAD_QUALIFICATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)} className="h-9 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none"><option value="">Все этапы воронки</option>{stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-950 px-4 py-2 text-[13px] text-white">
          <span>Выбрано: {selected.size}</span>
          <button onClick={() => setConfirm([...selected])} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1 font-medium hover:bg-rose-600"><Trash2 className="h-3.5 w-3.5" />Удалить</button>
          <button onClick={() => setSelected(new Set(filtered.map((c) => c.id)))} className="text-white/70 hover:text-white">Выбрать все {filtered.length}</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto inline-flex items-center gap-1 text-white/70 hover:text-white"><X className="h-3.5 w-3.5" />Снять выбор</button>
        </div>
      )}
      <div className="hidden grid-cols-[20px_minmax(240px,1.3fr)_minmax(110px,.5fr)_minmax(180px,1fr)_90px_32px] gap-3 border-b border-slate-100 px-4 py-2 text-[11px] font-medium text-slate-400 md:grid dark:border-white/[.06]"><span /><span>Клиент</span><span>Источник</span><span>Сделка</span><span className="text-right">Добавлен</span><span /></div>
      <div className="divide-y divide-slate-100 dark:divide-white/[.06]">
        {filtered.map((contact) => (
          <div key={contact.id} className={`group grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[.03] md:grid-cols-[20px_minmax(240px,1.3fr)_minmax(110px,.5fr)_minmax(180px,1fr)_90px_32px] ${selected.has(contact.id) ? "bg-violet-50/60 dark:bg-violet-500/10" : ""}`}>
            <input type="checkbox" checked={selected.has(contact.id)} onChange={() => toggle(contact.id)} aria-label="Выбрать" className="h-4 w-4 accent-slate-900" />
            <Link href={`/contacts/${contact.id}`} className="flex min-w-0 items-center gap-3">
              <Avatar name={contact.name || "?"} channel={null} size={34} src={String(contact.source || "").startsWith("telegram") ? `/api/contacts/${contact.id}/avatar` : null} />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-slate-900 group-hover:underline dark:text-white">{contact.name || "Без имени"}{contact.company ? <span className="font-normal text-slate-400"> · {contact.company}</span> : null}</div>
                <div className="mt-0.5 flex min-w-0 gap-x-3 text-[12px] text-slate-500">{contact.phone && <span className="inline-flex shrink-0 items-center gap-1"><Phone className="h-3 w-3" />{contact.phone}</span>}{contact.email && <span className="inline-flex min-w-0 items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{contact.email}</span></span>}{!contact.phone && !contact.email && <span className="text-slate-400">{String(contact.notes || "").match(/\[telegram-user:([^\]]+)\]/)?.[1] || "нет контактов"}</span>}</div>
              </div>
            </Link>
            <div className="hidden truncate text-[12.5px] text-slate-500 md:block">{sourceLabels[String(contact.source)] || "—"}</div>
            <div className="min-w-0 text-right md:text-left">
              {contact.activeDealId
                ? <Link href={`/deals/${contact.activeDealId}`} className="block min-w-0"><span className="block truncate text-[13px] text-slate-800 hover:underline dark:text-slate-200">{contact.activeDealTitle}</span><span className={`mt-0.5 inline-flex rounded-md px-1.5 py-px text-[11px] font-medium ${contact.stageIsLost ? "bg-rose-50 text-rose-700" : contact.stageIsWon ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600 dark:bg-white/[.06] dark:text-slate-300"}`}>{contact.stageName}</span></Link>
                : <span className="text-[12.5px] text-slate-400">{qualificationLabels[String(contact.qualification)] || "без сделки"}</span>}
            </div>
            <div className="hidden text-right text-[12px] tabular-nums text-slate-400 md:block">{(() => { const v = Number(contact.createdAt as unknown) || new Date(contact.createdAt as unknown as string).getTime() || 0; const ms = v > 1e14 ? v / 1000 : v > 1e12 ? v : v * 1000; return ms ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(ms)) : ""; })()}</div>
            <button onClick={() => setConfirm([contact.id])} className="hidden h-8 w-8 items-center justify-center rounded-lg text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 md:flex" aria-label="Удалить клиента"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {!filtered.length && <div className="px-6 py-14 text-center text-sm text-slate-400">Ничего не найдено. Попробуй изменить поиск или фильтр.</div>}
      </div>
      <ConfirmDelete open={Boolean(confirm)} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => confirm && void remove(confirm)}
        title={confirm && confirm.length > 1 ? `Удалить ${confirm.length} клиентов?` : "Удалить клиента?"}
        text="Вместе с клиентом удалятся его сделки и задачи. Переписка в «Сообщениях» останется, но отвяжется от карточки." />
      <div className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">Показано {filtered.length} из {contacts.length}</div>
    </section>
  );
}
