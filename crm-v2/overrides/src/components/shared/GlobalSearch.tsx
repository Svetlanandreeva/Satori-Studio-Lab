"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Kanban, Loader2, Mail, Search, UserRound, X } from "lucide-react";

interface Result { type: "contact" | "deal" | "message" | "project"; id: string; title: string; subtitle?: string; href: string; }

const icons = { contact: UserRound, deal: Kanban, message: Mail, project: FolderKanban };
const labels = { contact: "Клиент", deal: "Сделка", message: "Сообщение", project: "Проект" };

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); inputRef.current?.focus(); setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    const click = (event: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("keydown", key); document.addEventListener("mousedown", click);
    return () => { window.removeEventListener("keydown", key); document.removeEventListener("mousedown", click); };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setLoading(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (response.ok) setResults(data.results || []);
      } catch (error) { if ((error as Error)?.name !== "AbortError") setResults([]); }
      finally { setLoading(false); }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  function go(item: Result) {
    setOpen(false); setQuery(""); router.push(item.href);
  }

  return (
    <div ref={rootRef} className="relative hidden min-w-0 flex-1 md:block md:max-w-[520px]">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input ref={inputRef} value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} placeholder="Поиск по всей CRM" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-16 text-[13px] text-slate-800 outline-none transition focus:border-slate-300 focus:bg-white focus:ring-4 focus:ring-slate-100" />
        {query ? <button type="button" onClick={() => { setQuery(""); setResults([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button> : <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-medium text-slate-400">⌘K</span>}
      </div>
      {open && query.trim().length >= 2 && <div className="absolute left-0 right-0 top-[46px] z-[90] max-h-[460px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_20px_60px_rgba(15,23,42,.16)]">
        {loading && <div className="flex items-center justify-center p-6 text-xs text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Ищем…</div>}
        {!loading && !results.length && <div className="p-6 text-center text-xs text-slate-400">Ничего не найдено</div>}
        {!loading && results.map((item) => {
          const Icon = icons[item.type] || Search;
          return <button key={`${item.type}:${item.id}`} type="button" onClick={() => go(item)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-slate-900">{item.title}</span><span className="mt-0.5 block truncate text-[11px] text-slate-400">{item.subtitle || labels[item.type]}</span></span><span className="text-[9px] uppercase tracking-wide text-slate-300">{labels[item.type]}</span></button>;
        })}
      </div>}
    </div>
  );
}
