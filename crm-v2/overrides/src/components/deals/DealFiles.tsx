"use client";

import { useState } from "react";
import { DocumentChip, DocumentPreview, type PreviewDoc } from "@/components/documents/DocumentPreview";

/** «Файлы и КП» в карточке сделки: клик открывает файл прямо в CRM, скачивание — кнопкой в просмотре. */
export function DealFiles({ contactId, documents }: { contactId: string; documents: PreviewDoc[] }) {
  const [open, setOpen] = useState<PreviewDoc | null>(null);
  const [all, setAll] = useState(false);
  const shown = all ? documents : documents.slice(0, 12);
  return (
    <>
      <div className="flex flex-wrap gap-2">{shown.map((d) => <DocumentChip key={d.id} doc={d} onOpen={setOpen} />)}</div>
      {documents.length > 12 && !all && <button onClick={() => setAll(true)} className="mt-2 text-xs text-slate-500 hover:underline">Показать все ({documents.length})</button>}
      <DocumentPreview contactId={contactId} doc={open} onClose={() => setOpen(null)} />
    </>
  );
}
