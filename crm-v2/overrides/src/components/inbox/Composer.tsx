"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ProposalDialog } from "@/components/documents/ProposalDialog";
import { Sparkles, BookmarkPlus, ChevronDown, FileText, FolderOpen, Loader2, MessageSquareText, Paperclip, Plus, Search, Send, Upload, X } from "lucide-react";

export interface Template { id: string; title: string; channel: "all" | "email" | "telegram"; body: string; sortOrder: number; }
type ClientDoc = { id: string; name: string; sizeBytes?: number; createdAt?: number; mimeType?: string | null };

function useOutside(ref: React.RefObject<HTMLElement | null>, close: () => void, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", on); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", on); document.removeEventListener("keydown", key); };
  }, [open, close, ref]);
}

const kb = (n?: number) => (n ? (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`) : "");

/** Поле ответа: текст, вложение (с компьютера или из файлов клиента) и шаблоны. */
export function Composer({ channel, contactId, clientName, templates, sending, onSend, onTemplatesChanged, draftKey }: {
  draftKey?: string; channel: "email" | "telegram"; contactId: string | null; clientName: string; templates: Template[]; sending: boolean;
  onSend: (text: string, file: File | null) => Promise<boolean>; onTemplatesChanged: () => void;
}) {
  // Черновик хранится в браузере для каждого диалога — не потеряется при переходах и перезагрузке.
  const storageKey = `crm-draft:${draftKey || `${channel}:${contactId || ""}`}`;
  const [draft, setDraft] = useState(() => { try { return typeof window === "undefined" ? "" : localStorage.getItem(storageKey) || ""; } catch { return ""; } });
  useEffect(() => { try { if (draft.trim()) localStorage.setItem(storageKey, draft); else localStorage.removeItem(storageKey); } catch {} }, [draft, storageKey]);
  const [file, setFile] = useState<File | null>(null);
  const [menu, setMenu] = useState<null | "attach" | "client" | "templates">(null);
  const [docs, setDocs] = useState<ClientDoc[] | null>(null);
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [proposalOpen, setProposalOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  useOutside(box, () => setMenu(null), Boolean(menu));

  // Черновик — свой для каждого диалога.
  useEffect(() => { setFile(null); setDocs(null); setMenu(null); }, [contactId, channel]);
  useEffect(() => {
    const el = area.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.min(220, Math.max(44, el.scrollHeight))}px`;
  }, [draft]);

  const firstName = clientName.split(/\s+/)[0] || "";
  const fill = (body: string) => body.replace(/\{(имя|name)\}/gi, firstName).replace(/\{(клиент|client)\}/gi, clientName);
  const visible = templates.filter((t) => (t.channel === "all" || t.channel === channel) && (!q || `${t.title} ${t.body}`.toLowerCase().includes(q.toLowerCase())));

  function insertTemplate(t: Template) {
    const text = fill(t.body);
    setDraft((d) => (d.trim() ? `${d.replace(/\s+$/, "")}\n\n${text}` : text));
    setMenu(null); setQ("");
    requestAnimationFrame(() => area.current?.focus());
  }

  async function saveTemplate() {
    if (!draft.trim()) return toast.error("Сначала напиши текст — он станет шаблоном");
    const title = prompt("Название шаблона", draft.trim().split("\n")[0].slice(0, 40));
    if (!title?.trim()) return;
    const r = await fetch("/api/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title.trim(), channel: "all", body: draft.trim() }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(d.error || "Не удалось сохранить шаблон");
    toast.success("Шаблон сохранён"); setMenu(null); onTemplatesChanged();
  }

  async function openClientFiles() {
    setMenu("client");
    if (docs || !contactId) return;
    const r = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/documents`, { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    setDocs((d.documents || []).sort((a: ClientDoc, b: ClientDoc) => Number(b.createdAt || 0) - Number(a.createdAt || 0)));
  }

  async function pickClientDoc(doc: ClientDoc) {
    if (!contactId) return;
    setLoadingDoc(doc.id);
    try {
      const r = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/documents/${encodeURIComponent(doc.id)}?download=1`);
      if (!r.ok) throw new Error("Не удалось взять файл");
      const blob = await r.blob();
      setFile(new File([blob], doc.name, { type: blob.type || doc.mimeType || "application/octet-stream" }));
      setMenu(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); } finally { setLoadingDoc(null); }
  }

  async function submit() {
    if (sending || (!draft.trim() && !file)) return;
    if (await onSend(draft, file)) { setDraft(""); setFile(null); }
  }

  const enterSends = channel === "telegram";
  const item = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-slate-100 dark:hover:bg-white/[.06]";

  return (
    <div ref={box} className="relative border-t bg-white p-3 dark:bg-[#16181d]">
      {menu && (
        <div className="absolute bottom-full left-3 z-30 mb-2 w-[min(360px,calc(100%-24px))] overflow-hidden rounded-xl border bg-white shadow-xl dark:bg-[#1c1f25]">
          {menu === "attach" && (
            <div className="p-1.5">
              <button type="button" className={item} onClick={() => { setMenu(null); fileInput.current?.click(); }}><Upload className="h-4 w-4 text-slate-500" />Файл с компьютера<span className="ml-auto text-[11px] text-slate-400">до 20 МБ</span></button>
              <button type="button" className={item} disabled={!contactId} onClick={() => void openClientFiles()}><FolderOpen className="h-4 w-4 text-slate-500" />Из файлов клиента<span className="ml-auto text-[11px] text-slate-400">КП, договоры, фото</span></button>
              <button type="button" className={item} onClick={() => setMenu("templates")}><MessageSquareText className="h-4 w-4 text-slate-500" />Шаблон сообщения</button>
              <button type="button" className={item} disabled={!contactId} onClick={() => { setMenu(null); setProposalOpen(true); }}><Sparkles className="h-4 w-4 text-violet-500" />КП от AI<span className="ml-auto text-[11px] text-slate-400">из переписки и файлов</span></button>
            </div>
          )}
          {menu === "client" && (
            <div className="max-h-80 overflow-y-auto p-1.5">
              <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">Файлы клиента</div>
              {!docs ? <div className="flex items-center gap-2 px-2.5 py-3 text-[13px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Загрузка…</div>
                : !docs.length ? <div className="px-2.5 py-3 text-[13px] text-slate-500">У клиента пока нет файлов.</div>
                : docs.map((d) => <button type="button" key={d.id} className={item} onClick={() => void pickClientDoc(d)}>{loadingDoc === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-slate-500" />}<span className="min-w-0 flex-1 truncate">{d.name}</span><span className="text-[11px] text-slate-400">{kb(d.sizeBytes)}</span></button>)}
            </div>
          )}
          {menu === "templates" && (
            <div>
              <div className="border-b p-2"><div className="relative"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти шаблон" className="h-8 w-full rounded-lg border bg-transparent pl-8 pr-2 text-[13px] outline-none" /></div></div>
              <div className="max-h-72 overflow-y-auto p-1.5">
                {!visible.length ? <div className="px-2.5 py-3 text-[13px] text-slate-500">{templates.length ? "Ничего не нашлось." : "Шаблонов пока нет — напиши текст и сохрани его как шаблон."}</div>
                  : visible.map((t) => <button type="button" key={t.id} onClick={() => insertTemplate(t)} className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/[.06]"><div className="text-[13px] font-medium">{t.title}</div><div className="line-clamp-2 text-[12px] text-slate-500">{fill(t.body)}</div></button>)}
              </div>
              <div className="flex items-center justify-between border-t px-2 py-1.5">
                <button type="button" onClick={() => void saveTemplate()} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium hover:bg-slate-100 dark:hover:bg-white/[.06]"><BookmarkPlus className="h-3.5 w-3.5" />Сохранить текст как шаблон</button>
                <Link href="/control" className="px-2 text-[11px] text-slate-400 hover:text-slate-700">Управлять →</Link>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border bg-slate-50/70 focus-within:border-slate-400 focus-within:bg-white dark:bg-white/[.03]">
        {file && (
          <div className="flex items-center gap-2 border-b px-3 py-2 text-[12px]">
            <Paperclip className="h-3.5 w-3.5 text-slate-400" /><span className="min-w-0 flex-1 truncate font-medium">{file.name}</span><span className="text-slate-400">{kb(file.size)}</span>
            <button type="button" onClick={() => setFile(null)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Убрать файл"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        <textarea ref={area} rows={1} value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && ((enterSends && !e.shiftKey) || e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}
          placeholder={channel === "telegram" ? "Сообщение в Telegram…" : "Ответ по почте — уйдёт всем участникам…"} className="block max-h-[220px] min-h-[44px] w-full resize-none bg-transparent px-3.5 py-2.5 text-[14px] leading-relaxed outline-none" />
        <div className="flex items-center gap-1 px-2 pb-2">
          <button type="button" onClick={() => setMenu(menu === "attach" ? null : "attach")} className={`flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium ${menu === "attach" || menu === "client" ? "bg-slate-200 dark:bg-white/[.1]" : "text-slate-600 hover:bg-slate-200/70 dark:hover:bg-white/[.06]"}`}><Plus className="h-4 w-4" />Вложить<ChevronDown className="h-3 w-3 opacity-60" /></button>
          <button type="button" onClick={() => setMenu(menu === "templates" ? null : "templates")} className={`flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium ${menu === "templates" ? "bg-slate-200 dark:bg-white/[.1]" : "text-slate-600 hover:bg-slate-200/70 dark:hover:bg-white/[.06]"}`}><MessageSquareText className="h-4 w-4" />Шаблоны</button>
          <span className="ml-auto hidden pr-2 text-[11px] text-slate-400 sm:inline">{enterSends ? "Enter — отправить · Shift+Enter — перенос" : "⌘/Ctrl+Enter — отправить"}</span>
          <button type="button" onClick={() => void submit()} disabled={sending || (!draft.trim() && !file)} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-700 disabled:bg-slate-300 dark:bg-white dark:text-slate-900" aria-label="Отправить">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
        </div>
      </div>
      {contactId && <ProposalDialog open={proposalOpen} contactId={contactId} onClose={() => setProposalOpen(false)} saveLabel="Сохранить и приложить" onSaved={(doc) => { setProposalOpen(false); void pickClientDoc(doc); }} />}
      <input ref={fileInput} type="file" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ""; }} />
    </div>
  );
}
