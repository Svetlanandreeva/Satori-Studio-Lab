"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

/** Подключение Метрики и ручной расход на рекламу за месяц. */
export function MetrikaSetup({ configured, counterId, month, spend }: { configured: boolean; counterId: string; month: string; spend: number }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [counter, setCounter] = useState(counterId);
  const [cost, setCost] = useState(spend ? String(spend) : "");
  const [busy, setBusy] = useState(false);
  async function save(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/metrika", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Не удалось сохранить");
      toast.success(ok); setToken(""); router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); } finally { setBusy(false); }
  }
  const field = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] outline-none focus:border-slate-400 dark:border-white/[.1] dark:bg-transparent";
  return (
    <div className="grid gap-4 text-[13px] md:grid-cols-2">
      <div className="space-y-2">
        <div className="font-medium">Яндекс Метрика {configured ? <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">подключена</span> : null}</div>
        <div className="flex flex-wrap gap-2">
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder={configured ? "Новый токен (если нужно заменить)" : "OAuth-токен Метрики"} className={`${field} min-w-[220px] flex-1`} />
          <input value={counter} onChange={(e) => setCounter(e.target.value)} placeholder="Счётчик" className={`${field} w-32`} />
          <button disabled={busy || (!token.trim() && counter === counterId)} onClick={() => void save({ token: token.trim() || undefined, counterId: counter }, "Метрика сохранена")} className="h-9 rounded-lg bg-slate-900 px-3 text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}</button>
        </div>
        <p className="text-[12px] leading-5 text-slate-500">Токен с правом «Чтение статистики» (metrika:read). Можно взять тот же, что стоит на сайте для офлайн-конверсий (YANDEX_METRIKA_TOKEN), или выпустить на oauth.yandex.ru.</p>
      </div>
      <div className="space-y-2">
        <div className="font-medium">Расход на рекламу за месяц, ₽</div>
        <div className="flex gap-2">
          <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="Если Директ не связан с Метрикой" className={`${field} flex-1`} />
          <button disabled={busy} onClick={() => void save({ month, spend: cost || 0 }, "Расход сохранён")} className="h-9 rounded-lg border px-3 dark:border-white/[.1]">Сохранить</button>
        </div>
        <p className="text-[12px] leading-5 text-slate-500">Если Директ связан со счётчиком, расход подтянется сам. Ручная сумма важнее автоматической — очисти поле, чтобы брать из Директа.</p>
      </div>
    </div>
  );
}
