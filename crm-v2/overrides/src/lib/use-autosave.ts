"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/**
 * Автосохранение: сохраняет через `delay` мс после последнего изменения,
 * а также при уходе со страницы/закрытии вкладки, если что-то не успело сохраниться.
 * `save` должен сам кидать ошибку, если сервер ответил неуспехом.
 */
export function useAutosave<T>(data: T, dirty: boolean, save: (data: T, opts: { keepalive: boolean }) => Promise<void>, delay = 900) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ data, dirty, save });
  latest.current = { data, dirty, save };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const run = useCallback(async (keepalive = false) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!latest.current.dirty) return;
    if (inflight.current) await inflight.current.catch(() => {});
    if (!latest.current.dirty) return;
    setStatus("saving"); setError(null);
    const p = latest.current.save(latest.current.data, { keepalive });
    inflight.current = p;
    try { await p; setStatus("saved"); }
    catch (e) { setStatus("error"); setError(e instanceof Error ? e.message : "Не удалось сохранить"); }
    finally { inflight.current = null; }
  }, []);

  const key = JSON.stringify(data);
  useEffect(() => {
    if (!dirty) return;
    if (!inflight.current) setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [key, dirty, delay, run]);

  useEffect(() => {
    const flush = () => { if (latest.current.dirty) void run(true); };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("beforeunload", flush); window.removeEventListener("pagehide", flush); flush(); };
  }, [run]);

  return { status, error, flush: () => run() };
}

export function autosaveLabel(status: AutosaveStatus, error: string | null) {
  if (status === "pending" || status === "saving") return { text: "Сохраняю…", tone: "text-slate-400" };
  if (status === "saved") return { text: "Сохранено", tone: "text-emerald-600" };
  if (status === "error") return { text: `Не сохранилось: ${error || "ошибка"}`, tone: "text-rose-600" };
  return { text: "Изменения сохраняются сами", tone: "text-slate-400" };
}
