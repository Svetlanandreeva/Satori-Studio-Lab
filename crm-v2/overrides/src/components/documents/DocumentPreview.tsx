"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, FileText, Loader2, X } from "lucide-react";
import { previewKind } from "@/lib/preview-kind";

export type PreviewDoc = { id: string; name: string; mimeType?: string | null; sizeBytes?: number | null };

/** Просмотр вложения прямо в CRM: картинки, PDF, Word, Excel, текст. Скачать — отдельной кнопкой. */
export function DocumentPreview({ contactId, doc, onClose }: { contactId: string; doc: PreviewDoc | null; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const docId = doc?.id || null;
  useEffect(() => {
    setLoaded(false);
    if (!docId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [docId]);
  if (!doc) return null;

  const base = `/api/contacts/${encodeURIComponent(contactId)}/documents/${encodeURIComponent(doc.id)}`;
  const kind = previewKind(doc.name, doc.mimeType);
  const src = kind === "docx" || kind === "xlsx" || kind === "text" ? `${base}/preview` : base;
  const size = doc.sizeBytes ? (doc.sizeBytes > 1024 * 1024 ? `${(doc.sizeBytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(doc.sizeBytes / 1024))} КБ`) : "";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-2 sm:p-4" onClick={onClose}>
      <div className="flex h-[94vh] w-[min(1100px,98vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#16181d]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b px-4 py-3 dark:border-white/[.08]">
          <FileText className="h-4 w-4 shrink-0 text-slate-500" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{doc.name}</div>
            {size && <div className="text-[11px] text-slate-400">{size}</div>}
          </div>
          <a href={base} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-slate-50 sm:flex dark:border-white/[.1] dark:hover:bg-white/[.05]"><ExternalLink className="h-3.5 w-3.5" />В новой вкладке</a>
          <a href={`${base}?download=1`} className="flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"><Download className="h-3.5 w-3.5" />Скачать</a>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[.06]" aria-label="Закрыть"><X className="h-4 w-4" /></button>
        </div>
        <div className="relative min-h-0 flex-1 bg-slate-100 dark:bg-black/30">
          {kind === "none" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-slate-500">
              <FileText className="h-10 w-10 text-slate-300" />
              <div>Этот формат нельзя открыть в браузере.</div>
              <a href={`${base}?download=1`} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">Скачать файл</a>
            </div>
          ) : (
            <>
              {!loaded && <div className="absolute inset-0 flex items-center justify-center text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Открываю…</div>}
              {kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <div className="flex h-full items-center justify-center overflow-auto p-4"><img src={src} alt={doc.name} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} className="max-h-full max-w-full rounded-md object-contain shadow" /></div>
              ) : (
                <iframe key={src} title={doc.name} src={src} onLoad={() => setLoaded(true)} sandbox={kind === "pdf" ? undefined : "allow-same-origin"} className="h-full w-full border-0" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Чип вложения: по клику открывает предпросмотр. */
export function DocumentChip({ doc, onOpen, dark = false }: { doc: PreviewDoc; onOpen: (d: PreviewDoc) => void; dark?: boolean }) {
  return (
    <button type="button" onClick={() => onOpen(doc)} className={`flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${dark ? "border-slate-700 bg-slate-800 text-white hover:bg-slate-700" : "bg-slate-50 text-slate-700 hover:bg-white"}`}>
      <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
      <span className="min-w-0 truncate">{doc.name}</span>
      {doc.sizeBytes ? <span className="shrink-0 opacity-50">{Math.max(1, Math.round(doc.sizeBytes / 1024))} КБ</span> : null}
    </button>
  );
}
