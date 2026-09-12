import { BarChart3, Clock3, Percent, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import { getAnalyticsSnapshot } from "@/lib/operations";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  website: "Сайт", order: "Сайт", need_number: "Need Number", email: "Почта", telegram: "Telegram-бот",
  telegram_account: "Telegram", instagram: "Instagram", linkedin: "LinkedIn", ads: "Реклама", referral: "Рекомендации", otro: "Другое", other: "Другое",
};
function money(value: number) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format((Number(value) || 0) / 100); }
function percent(value: number) { return `${(Number(value) || 0).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`; }
function duration(hours: number) { return hours < 24 ? `${hours.toFixed(1)} ч` : `${(hours / 24).toFixed(1)} дн.`; }
function responseTime(minutes: number) { if (!minutes) return "—"; return minutes < 60 ? `${Math.round(minutes)} мин` : `${(minutes / 60).toFixed(1)} ч`; }

export default function AnalyticsPage() {
  const data = getAnalyticsSnapshot();
  const t = data.totals;
  return (
    <div className="mx-auto max-w-[1480px] space-y-5 pb-10">
      <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-slate-400"><BarChart3 className="h-4 w-4" /> Продажи и эффективность</div>
        <h1 className="text-3xl font-semibold tracking-[-.035em] text-slate-950">Аналитика</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-6 text-slate-500">Конверсия, средний чек, скорость ответа, источники продаж, причины отказов и время на этапах воронки.</p>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <Metric icon={Percent} label="Конверсия" value={percent(t.conversion)} />
        <Metric icon={ReceiptText} label="Средний чек" value={money(t.avgCheck)} />
        <Metric icon={WalletCards} label="Получено" value={money(t.revenue)} />
        <Metric icon={TrendingUp} label="Прибыль" value={money(t.profit)} />
        <Metric icon={Clock3} label="Первый ответ" value={responseTime(t.avgFirstResponseMinutes)} />
        <Metric icon={BarChart3} label="Активных сделок" value={String(t.activeDeals)} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
        <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-base font-semibold text-slate-950">Источники</h2><p className="mt-1 text-xs text-slate-400">Сколько лидов и сделок приходит из каждого канала</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-[11px] font-medium text-slate-400"><tr><th className="px-5 py-3">Источник</th><th className="px-4 py-3">Клиенты</th><th className="px-4 py-3">Сделки</th><th className="px-4 py-3">Победы</th><th className="px-4 py-3">Конверсия</th><th className="px-4 py-3">Выручка</th><th className="px-5 py-3">Прибыль</th></tr></thead><tbody className="divide-y divide-slate-100">{data.sources.map((item) => <tr key={item.source}><td className="px-5 py-3 font-medium text-slate-800">{SOURCE_LABELS[item.source] || item.source}</td><td className="px-4 py-3 text-slate-600">{item.contacts}</td><td className="px-4 py-3 text-slate-600">{item.deals}</td><td className="px-4 py-3 text-slate-600">{item.won}</td><td className="px-4 py-3 font-medium text-slate-800">{percent(item.conversion)}</td><td className="px-4 py-3 text-slate-600">{money(item.revenue)}</td><td className={`px-5 py-3 font-medium ${item.profit < 0 ? "text-rose-600" : "text-emerald-700"}`}>{money(item.profit)}</td></tr>)}</tbody></table>{!data.sources.length && <div className="p-10 text-center text-sm text-slate-400">Пока недостаточно данных.</div>}</div>
        </section>

        <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-base font-semibold text-slate-950">Причины отказов</h2><p className="mt-1 text-xs text-slate-400">Почему сделки не дошли до продажи</p></div>
          <div className="space-y-3 p-5">{data.lossReasons.map((item) => {
            const max = Math.max(1, ...data.lossReasons.map((x) => x.count));
            return <div key={item.reason}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="text-slate-700">{item.reason}</span><span className="font-semibold text-slate-900">{item.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-800" style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }} /></div></div>;
          })}{!data.lossReasons.length && <div className="py-8 text-center text-sm text-slate-400">Отказов с причинами пока нет.</div>}</div>
        </section>
      </div>

      <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-base font-semibold text-slate-950">Сколько сделка находится на этапе</h2><p className="mt-1 text-xs text-slate-400">Среднее время по накопленной истории переходов</p></div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">{data.stageDurations.map((item) => <div key={item.stage} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4"><div className="text-xs text-slate-400">{item.stage}</div><div className="mt-1 text-xl font-semibold text-slate-950">{duration(item.avgHours)}</div><div className="mt-1 text-[10px] text-slate-400">по {item.samples} переходам</div></div>)}{!data.stageDurations.length && <div className="col-span-full py-8 text-center text-sm text-slate-400">История этапов начнёт накапливаться после движения сделок.</div>}</div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Percent; label: string; value: string }) {
  return <div className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm"><div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Icon className="h-3.5 w-3.5" />{label}</div><div className="mt-2 truncate text-xl font-semibold tracking-tight text-slate-950">{value}</div></div>;
}
