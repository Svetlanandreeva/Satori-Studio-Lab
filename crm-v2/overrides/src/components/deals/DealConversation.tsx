"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Paperclip, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentChip, DocumentPreview, type PreviewDoc } from "@/components/documents/DocumentPreview";

type Doc = PreviewDoc & { sourceMessageId?: string | null };
type Msg = { id: string; direction: string; bodyText?: string; sourceMessageId?: string | null };
type Detail = { docContactId?: string; empty?: boolean; channel?: "email" | "telegram"; id?: string; messages: Msg[]; documents: Doc[] };

/** Переписка с клиентом в карточке сделки — с вложениями, которые открываются прямо в CRM. */
export function DealConversation({ contactId, threadId }: { contactId: string; threadId?: string | null }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewDoc | null>(null);
  const end = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const show = (channel: "email" | "telegram", id: string, d: any) => {
      setDetail({ channel, id, messages: d.messages || [], documents: d.documents || [], docContactId: d.contact?.id || d.thread?.contactId || contactId });
      setTimeout(() => end.current?.scrollIntoView({ block: "end" }), 20);
    };
    if (threadId) {
      const r = await fetch(`/api/inbox/${encodeURIComponent(threadId)}`, { cache: "no-store" });
      if (r.ok) return show("email", threadId, await r.json());
    }
    const [emails, tgs] = await Promise.all([
      fetch("/api/inbox?filter=client", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/messages/telegram", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]);
    const email = (emails.threads || []).find((x: any) => x.contactId === contactId);
    const tg = (tgs.threads || []).find((x: any) => (x.contactId || x.id) === contactId);
    const chosen = tg ? { channel: "telegram" as const, id: tg.id } : email ? { channel: "email" as const, id: email.id } : null;
    if (!chosen) return setDetail({ empty: true, messages: [], documents: [] });
    const r = await fetch(chosen.channel === "telegram" ? `/api/messages/telegram/${encodeURIComponent(chosen.id)}` : `/api/inbox/${encodeURIComponent(chosen.id)}`, { cache: "no-store" });
    show(chosen.channel, chosen.id, await r.json());
  }, [contactId, threadId]);

  useEffect(() => { void load(); }, [load]);

  async function send() {
    if (!draft.trim() || !detail?.id) return;
    setBusy(true);
    try {
      const r = detail.channel === "telegram"
        ? await fetch("/api/integrations/telegram/reply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contactId, text: draft }) })
        : await fetch(`/api/inbox/${encodeURIComponent(detail.id)}/reply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: draft }) });
      if (r.ok) { setDraft(""); await load(); }
    } finally { setBusy(false); }
  }

  const docsFor = (m: Msg) => (detail?.documents || []).filter((d) => d.sourceMessageId && m.sourceMessageId && d.sourceMessageId === m.sourceMessageId);
  const orphanDocs = (detail?.documents || []).filter((d) => !detail?.messages.some((m) => m.sourceMessageId && m.sourceMessageId === d.sourceMessageId));

  return (
    <div className={`flex ${detail?.empty ? "" : "h-[620px]"} min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]`}>
      <div className="border-b px-5 py-4">
        <div className="flex items-center gap-2 font-semibold"><MessageCircle className="h-4 w-4" />Диалог с клиентом</div>
        <div className="mt-1 text-xs text-slate-400">{detail?.channel === "telegram" ? "Telegram" : detail?.channel === "email" ? "Почта" : "Переписка"}{detail?.documents.length ? ` · вложений: ${detail.documents.length}` : ""}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 p-4">
        {!detail ? <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          : detail.empty ? <div className="py-6 text-center text-sm text-slate-400">Переписки с клиентом пока нет.</div>
          : <div className="space-y-2">
              {detail.messages.map((m) => {
                const out = m.direction === "outgoing";
                const docs = docsFor(m);
                const text = docs.length && /^(🖼 Фото|📎 Документ)/.test(m.bodyText || "") ? "" : m.bodyText;
                return (
                  <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm ${out ? "bg-slate-900 text-white" : "border bg-white text-slate-700"}`}>
                      {(text || !docs.length) && <div className="whitespace-pre-wrap break-words">{text || "—"}</div>}
                      {docs.length > 0 && <div className={`${text ? "mt-2" : ""} flex flex-col gap-1.5`}>{docs.map((d) => <DocumentChip key={d.id} doc={d} onOpen={setPreview} dark={out} contactId={detail.docContactId || contactId} />)}</div>}
                    </div>
                  </div>
                );
              })}
              {orphanDocs.length > 0 && (
                <div className="mt-3 rounded-xl border border-dashed bg-white p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Paperclip className="h-3.5 w-3.5" />Вложения из переписки</div>
                  <div className="flex flex-wrap gap-2">{orphanDocs.map((d) => <DocumentChip key={d.id} doc={d} onOpen={setPreview} contactId={detail.docContactId || contactId} />)}</div>
                </div>
              )}
              <div ref={end} />
            </div>}
      </div>
      {detail && !detail.empty && (
        <div className="border-t p-3">
          <div className="flex gap-2">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(); }} rows={2} placeholder="Ответить клиенту…" className="min-h-[62px] flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none" />
            <Button onClick={() => void send()} disabled={busy || !draft.trim()} className="h-auto">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
          </div>
        </div>
      )}
      <DocumentPreview contactId={detail?.docContactId || contactId} doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
