import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getAnalyticsSnapshot } from "@/lib/operations";
import { AdFunnel } from "@/components/analytics/AdFunnel";

export const dynamic = "force-dynamic";

function shift(m: string, d: number) { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + d, 1)).toISOString().slice(0, 7); }
function duration(hours: number) { return hours < 24 ? `${hours.toFixed(1)} ч` : `${(hours / 24).toFixed(1)} дн.`; }

export default async function AnalyticsPage({ searchParams }: { searchParams?: Promise<{ m?: string }> }) {
  const params = (await searchParams) || {};
  const now = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yekaterinburg", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(String(params.m || "")) ? String(params.m) : now;
  const data = getAnalyticsSnapshot();
  const title = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T00:00:00Z`));
  return (
    <div className="mx-auto max-w-[1480px] space-y-5 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Аналитика</h1>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm dark:border-white/[.08] dark:bg-[#16181d]">
          <Link href={`/analytics?m=${shift(month, -1)}`} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Предыдущий месяц"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-[120px] text-center font-medium capitalize">{title}</span>
          <Link href={`/analytics?m=${shift(month, 1)}`} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Следующий месяц"><ChevronRight className="h-4 w-4" /></Link>
        </div>
        {month !== now && <Link href="/analytics" className="text-xs text-slate-500 hover:text-slate-900">к текущему месяцу</Link>}
      </div>
      <AdFunnel month={month} />

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-base font-semibold text-slate-950 dark:text-white">Причины отказов</h2><p className="mt-1 text-xs text-slate-400">За всё время: почему сделки не дошли до продажи</p></div>
          <div className="space-y-3 p-5">{data.lossReasons.map((item) => {
            const max = Math.max(1, ...data.lossReasons.map((x) => x.count));
            return <div key={item.reason}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="text-slate-700">{item.reason}</span><span className="font-semibold text-slate-900">{item.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-800" style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }} /></div></div>;
          })}{!data.lossReasons.length && <div className="py-8 text-center text-sm text-slate-400">Отказов с причинами пока нет.</div>}</div>
        </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-base font-semibold text-slate-950 dark:text-white">Сколько сделка стоит на этапе</h2><p className="mt-1 text-xs text-slate-400">За всё время, в среднем</p></div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">{data.stageDurations.map((item) => <div key={item.stage} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4"><div className="text-xs text-slate-400">{item.stage}</div><div className="mt-1 text-xl font-semibold text-slate-950">{duration(item.avgHours)}</div><div className="mt-1 text-[10px] text-slate-400">по {item.samples} переходам</div></div>)}{!data.stageDurations.length && <div className="col-span-full py-8 text-center text-sm text-slate-400">История этапов начнёт накапливаться после движения сделок.</div>}</div>
      </section>
      </div>
    </div>
  );
}
