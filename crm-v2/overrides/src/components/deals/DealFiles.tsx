"use client";

import { useState } from "react";
import { DocumentChip, DocumentPreview, type PreviewDoc } from "@/components/documents/DocumentPreview";
import { ProposalDialog } from "@/components/documents/ProposalDialog";
import { Sparkles } from "lucide-react";

/** «Файлы и КП» в карточке сделки: клик открывает файл прямо в CRM, скачивание — кнопкой в просмотре. */
export function DealFiles({ contactId, documents: initialDocs, dealId }: { contactId: string; documents: PreviewDoc[]; dealId?: string }) {
  const [open, setOpen] = useState<PreviewDoc | null>(null);
  const [all, setAll] = useState(false);
  const [proposal, setProposal] = useState(false);
  const [documents, setDocuments] = useState(initialDocs);
  const shown = all ? documents : documents.slice(0, 12);
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold">Файлы и КП</h2>
        {contactId && <button type="button" onClick={() => setProposal(true)} className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium hover:bg-slate-50 dark:border-white/[.1] dark:hover:bg-white/[.05]"><Sparkles className="h-3.5 w-3.5 text-violet-500" />КП от AI</button>}
      </div>
      {!documents.length && <p className="text-[13px] text-slate-400">Файлов пока нет. Вложения из почты и Telegram появятся здесь сами.</p>}
      <div className="flex flex-wrap gap-2">{shown.map((d) => <DocumentChip key={d.id} doc={d} onOpen={setOpen} />)}</div>
      {documents.length > 12 && !all && <button onClick={() => setAll(true)} className="mt-2 text-xs text-slate-500 hover:underline">Показать все ({documents.length})</button>}
      <DocumentPreview contactId={contactId} doc={open} onClose={() => setOpen(null)} />
      <ProposalDialog open={proposal} contactId={contactId} dealId={dealId} onClose={() => setProposal(false)} onSaved={(doc) => { setDocuments((d) => [doc as PreviewDoc, ...d]); setProposal(false); setOpen(doc as PreviewDoc); }} saveLabel="Сохранить .docx и открыть" />
    </>
  );
}
