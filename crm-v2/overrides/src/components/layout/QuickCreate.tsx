"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Handshake, Plus, UserPlus } from "lucide-react";
import { DealDialog } from "@/components/deals/DealDialog";
import { ContactForm } from "@/components/contacts/ContactForm";

/** Кнопка «Создать» в шапке: сделка, клиент или задача — с любой страницы. */
export function QuickCreate() {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [deal, setDeal] = useState(false);
  const [contact, setContact] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [menu]);

  const item = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[.06]";

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setMenu((v) => !v)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-[13px] font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
        <Plus className="h-4 w-4" /><span className="hidden sm:inline">Создать</span>
      </button>
      {menu && (
        <div className="absolute right-0 top-11 z-50 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-white/[.08] dark:bg-[#1b1d23]">
          <button className={item} onClick={() => { setMenu(false); setDeal(true); }}><Handshake className="h-4 w-4 text-slate-400" />Сделку</button>
          <button className={item} onClick={() => { setMenu(false); setContact(true); }}><UserPlus className="h-4 w-4 text-slate-400" />Клиента</button>
          <button className={item} onClick={() => { setMenu(false); router.push("/tasks?new=1"); }}><CalendarClock className="h-4 w-4 text-slate-400" />Задачу</button>
        </div>
      )}
      <DealDialog open={deal} onClose={() => setDeal(false)} onSaved={({ id }) => id && router.push(`/deals/${id}`)} />
      <ContactForm open={contact} onClose={() => setContact(false)} onSaved={({ id }) => router.push(`/contacts/${id}`)} />
    </div>
  );
}
