"use client";

import { useEffect, useState } from "react";
import { AlertCircle, FileText, ImageIcon, Loader2, Mic, Video } from "lucide-react";

export type LoadedDoc = { id: string; name: string; mimeType?: string | null; sizeBytes: number; createdAt: number; sourceMessageId: string | null; kind: string };
type Media = { kind: string; name: string; mime: string | null; size: number | null };

// Не больше двух загрузок одновременно — в длинном чате может быть много фото.
let active = 0;
const waiting: Array<() => void> = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((r) => waiting.push(r));
  active += 1;
  try { return await fn(); } finally { active -= 1; waiting.shift()?.(); }
}

const LABEL: Record<string, string> = { photo: "фото", video: "видео", voice: "голосовое", video_note: "видеосообщение", audio: "аудио", animation: "анимацию", sticker: "стикер", document: "файл" };

/** Докачивает медиа из Telegram, если оно ещё не лежит в файлах клиента. */
export function TelegramMediaLoader({ contactId, activityId, media, onLoaded }: { contactId: string; activityId: string; media: Media; onLoaded: (doc: LoadedDoc) => void }) {
  const [state, setState] = useState<{ status: "loading" | "error"; error?: string }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    slot(async () => {
      const r = await fetch(`/api/messages/telegram/${encodeURIComponent(contactId)}/media`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ activityId }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Не удалось загрузить");
      return d.document as LoadedDoc;
    }).then((doc) => { if (!cancelled) onLoaded(doc); })
      .catch((e) => { if (!cancelled) setState({ status: "error", error: e instanceof Error ? e.message : "Ошибка" }); });
    return () => { cancelled = true; };
  }, [contactId, activityId, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const Icon = media.kind === "photo" || media.kind === "sticker" ? ImageIcon : media.kind === "voice" || media.kind === "audio" ? Mic : media.kind === "document" ? FileText : Video;
  const what = LABEL[media.kind] || "файл";
  if (state.status === "loading") {
    return <div className="flex items-center gap-2 rounded-xl border border-dashed bg-white/70 px-3 py-2.5 text-[12.5px] text-slate-500 dark:bg-white/[.03]"><Loader2 className="h-4 w-4 animate-spin" /><Icon className="h-4 w-4" />Загружаю {what}…</div>;
  }
  return (
    <div className="max-w-[340px] rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-[12.5px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <div className="flex items-center gap-1.5 font-medium"><AlertCircle className="h-4 w-4" />Не удалось загрузить {what}</div>
      <div className="mt-0.5 text-[11.5px] opacity-80">{state.error}</div>
      <button type="button" onClick={() => setAttempt((a) => a + 1)} className="mt-1.5 text-[12px] font-medium underline underline-offset-2">Повторить</button>
    </div>
  );
}
