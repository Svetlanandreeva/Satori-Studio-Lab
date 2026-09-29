"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, X } from "lucide-react";

type Comment = { id: string; authorId: string; authorName: string; text: string; createdAt: number };
export type ChatTask = { id: string; description: string; contactName?: string | null; ownerName?: string | null; scheduledAt?: string | null };

const time = (ms: number) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));

/** Панель задачи с чатом: исполнитель спрашивает, постановщик уточняет. */
export function TaskChat({ task, onClose, onRead }: { task: ChatTask; onClose: () => void; onRead?: () => void }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [me, setMe] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement | null>(null);
  const onReadRef = useRef(onRead);
  useEffect(() => { onReadRef.current = onRead; });

  useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/tasks/${task.id}/comments`, { cache: "no-store" }).then((r) => r.json()).then((d) => { if (alive) { setComments(d.comments || []); setMe(d.me || ""); } }).catch(() => {});
    void load().then(() => onReadRef.current?.());
    const t = setInterval(load, 15000); // новые ответы подтягиваются сами
    return () => { alive = false; clearInterval(t); };
  }, [task.id]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [comments?.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/tasks/${task.id}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Не отправилось");
      setComments((c) => [...(c || []), d.comment]); setText("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); } finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/30" onClick={onClose}>
      <aside className="flex h-full w-[min(440px,100vw)] flex-col bg-white shadow-2xl dark:bg-[#16181d]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b px-5 py-4 dark:border-white/[.08]">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold leading-snug">{task.description}</div>
            <div className="mt-1 text-[12px] text-slate-500">{[task.contactName, task.ownerName && `исполнитель: ${task.ownerName}`].filter(Boolean).join(" · ")}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[.06]" aria-label="Закрыть"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-4 dark:bg-transparent">
          {comments === null ? <div className="flex justify-center py-10 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /></div>
            : !comments.length ? <div className="py-10 text-center text-[13px] text-slate-400">Пока без вопросов. Напиши, если нужно что-то уточнить по задаче.</div>
            : comments.map((c) => {
              const mine = c.authorId === me;
              return (
                <div key={c.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed ${mine ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "border bg-white dark:border-white/[.08] dark:bg-white/[.04]"}`}>
                    {!mine && <div className="mb-0.5 text-[11px] font-semibold text-violet-600 dark:text-violet-300">{c.authorName}</div>}
                    <div className="whitespace-pre-wrap">{c.text}</div>
                    <div className={`mt-0.5 text-right text-[10.5px] ${mine ? "text-white/60 dark:text-slate-500" : "text-slate-400"}`}>{time(c.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          <div ref={end} />
        </div>
        <div className="border-t p-3 dark:border-white/[.08]">
          <div className="flex items-end gap-2 rounded-2xl border bg-white px-3 py-2 dark:border-white/[.1] dark:bg-transparent">
            <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} rows={2} placeholder="Вопрос или уточнение по задаче…" className="min-h-[40px] flex-1 resize-none bg-transparent text-[14px] outline-none" />
            <button onClick={() => void send()} disabled={!text.trim() || sending} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white disabled:opacity-30 dark:bg-white dark:text-slate-900" aria-label="Отправить">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
