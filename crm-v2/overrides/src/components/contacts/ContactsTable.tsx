"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronRight, Download, Mail, Phone, Users, Kanban, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LEAD_QUALIFICATION_OPTIONS, type LeadQualification } from "@/lib/lead-qualification";
import type { Contact, Temperature } from "@/types";

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
interface ContactsTableProps { contacts: ExtendedContact[]; }

const sourceLabels: Record<string, string> = {
  need_number: "Парсер", website: "Сайт", order: "Сайт", ads: "Реклама", email: "Почта", telegram: "Telegram-бот",
  telegram_account: "Telegram", instagram: "Instagram", linkedin: "LinkedIn", referral: "Рекомендация", other: "Другое", otro: "Другое",
};
const tempLabels: Record<string, string> = { hot: "Горячий", warm: "Тёплый", cold: "Холодный" };
const qualificationLabels: Record<string, string> = Object.fromEntries(LEAD_QUALIFICATION_OPTIONS.map((x) => [x.value, x.label]));

export function ContactsTable({ contacts }: ContactsTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterTemp, setFilterTemp] = useState<Temperature | "">("");
  const [filterQualification, setFilterQualification] = useState<LeadQualification | "">("");
  const [filterStage, setFilterStage] = useState("");

  const stages = useMemo(() => Array.from(new Set(contacts.map((item) => item.stageName).filter(Boolean) as string[])).sort(), [contacts]);
  const filtered = useMemo(() => contacts.filter((c) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [c.name, c.email, c.company, c.phone, c.activeDealTitle, c.stageName, c.ownerName].some((v) => String(v || "").toLowerCase().includes(q));
    return matchesSearch && (!filterTemp || c.temperature === filterTemp) && (!filterQualification || c.qualification === filterQualification) && (!filterStage || c.stageName === filterStage);
  }), [contacts, search, filterTemp, filterQualification, filterStage]);

  if (!contacts.length) {
    return <div className="rounded-[24px] border border-slate-200/80 bg-white px-6 py-16 text-center shadow-sm"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100"><Users className="h-5 w-5 text-slate-500" /></div><h2 className="mt-4 font-semibold text-slate-900">Пока нет клиентов</h2><p className="mx-auto mt-1 max-w-sm text-sm leading-5 text-slate-500">Клиенты появятся из заявок или после ручного добавления из переписки.</p></div>;
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
      <div className="space-y-3 border-b border-slate-100 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Имя, телефон, email, сделка, этап или ответственный" className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pl-10" /></div>
          <Button variant="ghost" size="sm" onClick={() => window.open("/api/export?type=contacts")} className="h-10 rounded-xl px-3 text-xs text-slate-400"><Download className="mr-1.5 h-3.5 w-3.5" /> Экспорт</Button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <select value={filterQualification} onChange={(e) => setFilterQualification(e.target.value as LeadQualification | "")} className="h-9 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none"><option value="">Все статусы лида</option>{LEAD_QUALIFICATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)} className="h-9 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none"><option value="">Все этапы воронки</option>{stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select>
          {(["", "hot", "warm", "cold"] as const).map((temp) => <Button key={temp || "all"} variant="outline" size="sm" onClick={() => setFilterTemp(temp)} className={`h-9 shrink-0 rounded-xl border-slate-200 px-3 text-xs ${filterTemp === temp ? "bg-slate-950 text-white hover:bg-slate-900 hover:text-white" : "bg-white text-slate-500"}`}>{temp ? tempLabels[temp] : "Любая температура"}</Button>)}
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {filtered.map((contact) => (
          <button key={contact.id} onClick={() => router.push(`/contacts/${contact.id}`)} className="group grid w-full grid-cols-[1fr_auto] gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50/80 sm:grid-cols-[minmax(220px,1.15fr)_minmax(130px,.7fr)_minmax(150px,.8fr)_minmax(130px,.65fr)_minmax(110px,.55fr)_auto] sm:items-center sm:px-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><span className="truncate text-[14px] font-semibold text-slate-900">{contact.name || "Без имени"}</span><span className={`hidden rounded-full px-2 py-0.5 text-[10px] sm:inline ${contact.temperature === "hot" ? "bg-rose-50 text-rose-600" : contact.temperature === "warm" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"}`}>{tempLabels[String(contact.temperature)] || ""}</span></div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">{contact.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{contact.phone}</span>}{contact.email && <span className="inline-flex max-w-[220px] items-center gap-1 truncate"><Mail className="h-3 w-3" />{contact.email}</span>}{!contact.phone && !contact.email && <span>Контакты не заполнены</span>}</div>
            </div>
            <div className="hidden min-w-0 sm:block"><div className="truncate text-[13px] text-slate-700">{contact.company || "—"}</div><div className="mt-0.5 text-[10px] text-slate-400">компания</div></div>
            <div className="hidden min-w-0 sm:block"><div className="flex items-center gap-1.5"><Kanban className="h-3.5 w-3.5 text-slate-400" /><span className={`truncate text-[12px] ${contact.stageIsLost ? "text-rose-600" : contact.stageIsWon ? "text-emerald-600" : "text-slate-700"}`}>{contact.stageName || "Без сделки"}</span></div><div className="mt-0.5 truncate text-[10px] text-slate-400">{contact.activeDealTitle || "воронка"}</div></div>
            <div className="hidden min-w-0 sm:block"><div className="flex items-center gap-1.5 text-[12px] text-slate-600"><UserRound className="h-3.5 w-3.5 text-slate-400" /><span className="truncate">{contact.ownerName || "Не назначен"}</span></div><div className="mt-0.5 text-[10px] text-slate-400">ответственный</div></div>
            <div className="hidden sm:block"><div className="text-[12px] text-slate-600">{qualificationLabels[String(contact.qualification)] || "Новый"}</div><div className="mt-0.5 text-[10px] text-slate-400">статус лида</div></div>
            <div className="flex items-center gap-2 self-center"><span className="text-[11px] text-slate-400 sm:hidden">{contact.stageName || qualificationLabels[String(contact.qualification)] || ""}</span><ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" /></div>
          </button>
        ))}
        {!filtered.length && <div className="px-6 py-14 text-center text-sm text-slate-400">Ничего не найдено. Попробуй изменить поиск или фильтр.</div>}
      </div>
      <div className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">Показано {filtered.length} из {contacts.length}</div>
    </section>
  );
}
