"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, CircleDollarSign, Clock3, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Insight = {
  id: string; severity: "critical" | "warning" | "info"; category: string; title: string; detail: string;
  entityType?: string | null; entityId?: string | null; actionUrl?: string | null; updatedAt: number;
};

type Channel = {
  source: string; label: string; leads: number; deals: number; won: number; revenue: number; directProfit: number; spend: number;
  conversion: number; cpl: number; cac: number; roas: number | null;
};

type AssistantState = {
  latestRun: null | { run_at?: number; cleaned_duplicates?: number; cleaned_activity_duplicates?: number };
  insights: Insight[]; channels: Channel[]; month: string;
};

function rub(value: number) { return `${Math.round((value || 0) / 100).toLocaleString("ru-RU")} ₽`; }
function when(value?: number) {
  if (!value) return "ещё не проверялось";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

const categoryLabels: Record<string, string> = {
  clients: "клиент", messages: "сообщение", projects: "проект", finance: "деньги", channels: "канал", crm: "CRM",
};

export function AssistantDashboard() {
  const [state, setState] = useState<AssistantState | null>(null);
  const [busy, setBusy] = useState(false);
  const [channel, setChannel] = useState("need_number");
  const [spend, setSpend] = useState("");

  const load = async () => {
    const res = await fetch("/api/assistant", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Не удалось загрузить помощника");
    setState(data);
  };

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "run", notify: false }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Проверка не выполнена");
      setState(data);
      toast.success("Проверила CRM — список обновлён");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка проверки"); }
    finally { setBusy(false); }
  };

  const saveSpend = async () => {
    const rubles = Number(spend.replace(",", "."));
    if (!Number.isFinite(rubles) || rubles < 0) return toast.error("Укажите сумму расхода");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "spend", channel, month: state?.month, amount: Math.round(rubles * 100) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось сохранить расход");
      setState(data); setSpend(""); toast.success("Расход сохранён");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); }
    finally { setBusy(false); }
  };

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []);
  const urgent = useMemo(() => state?.insights.filter(x => x.severity === "critical") || [], [state]);
  const attention = useMemo(() => state?.insights.filter(x => x.severity === "warning") || [], [state]);

  if (!state) return <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-400"><RefreshCw className="h-4 w-4 animate-spin" /> Собираю картину по CRM…</div>;

  return (
    <div className="mx-auto max-w-[1480px] space-y-5 pb-10">
      <div className="flex flex-col gap-4 rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-slate-400"><Sparkles className="h-4 w-4" /> Помощник Satori</div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">Что требует внимания</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-6 text-slate-500">Я проверяю сообщения, клиентов, проекты, сроки, деньги и каналы. Здесь оставляю только то, где нужно твоё решение.</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <span className="text-[12px] text-slate-400">Проверено: {when(Number(state.latestRun?.run_at || 0))}</span>
          <Button onClick={run} disabled={busy} className="rounded-xl">
            <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Обновить
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard icon={AlertCircle} label="Сделать сейчас" value={urgent.length} note="срочные ответы, сроки и проблемы" tone="critical" />
        <SummaryCard icon={Clock3} label="Не забыть" value={attention.length} note="follow-up и то, что лучше проверить" />
        <SummaryCard icon={TrendingUp} label="Каналы" value={state.channels.length} note="видим лиды, продажи и стоимость" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.18fr_.82fr]">
        <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-[16px] font-semibold text-slate-950">Список действий</h2>
            <p className="mt-0.5 text-[12px] text-slate-400">Сверху — самое важное</p>
          </div>
          {!state.insights.length ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50"><CheckCircle2 className="h-5 w-5 text-emerald-600" /></div>
              <div className="font-medium text-slate-900">Сейчас всё спокойно</div>
              <p className="mt-1 max-w-sm text-sm text-slate-400">Нет срочных сообщений, просроченных действий или новых проблем, которые требуют решения.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">{state.insights.slice(0, 20).map((item) => <ActionRow key={item.id} item={item} />)}</div>
          )}
        </section>

        <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-slate-400" /><h2 className="text-[16px] font-semibold text-slate-950">Стоимость привлечения</h2></div>
          <p className="mt-2 text-sm leading-5 text-slate-500">Укажи только то, что CRM сама не может узнать: сколько потрачено на рекламу или парсер за месяц. Остальное посчитается автоматически.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px_auto] xl:grid-cols-1">
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400">
              <option value="need_number">Парсер / Need Number</option><option value="ads">Реклама</option><option value="website">Сайт</option>
              <option value="instagram">Instagram</option><option value="linkedin">LinkedIn</option><option value="telegram_account">Telegram</option><option value="other">Другое</option>
            </select>
            <Input className="h-11 rounded-xl" inputMode="decimal" value={spend} onChange={(e) => setSpend(e.target.value)} placeholder="₽ за месяц" />
            <Button variant="outline" className="h-11 rounded-xl" onClick={saveSpend} disabled={busy}>Сохранить</Button>
          </div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-[12px] leading-5 text-slate-500">Производство, подрядчики, налоги и другие бизнес-расходы берутся из раздела «Деньги». Здесь только стоимость привлечения клиента.</div>
        </section>
      </div>

      <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-[16px] font-semibold text-slate-950">Откуда приходят деньги</h2>
          <p className="mt-0.5 text-[12px] text-slate-400">Сравнение каналов без маркетинговой терминологии</p>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {state.channels.map((c) => <ChannelCard key={c.source} channel={c} />)}
          {!state.channels.length && <p className="p-4 text-sm text-slate-400">Пока недостаточно данных по каналам.</p>}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, note, tone }: { icon: typeof AlertCircle; label: string; value: number; note: string; tone?: "critical" }) {
  return <Card className="rounded-[22px] border-slate-200/80 shadow-sm"><CardContent className="p-5"><div className="flex items-start justify-between gap-4"><div><div className="text-[12px] font-medium text-slate-400">{label}</div><div className={`mt-1 text-3xl font-semibold tracking-tight ${tone === "critical" && value ? "text-rose-600" : "text-slate-950"}`}>{value}</div><div className="mt-1 text-[12px] leading-4 text-slate-400">{note}</div></div><div className={`rounded-xl p-2.5 ${tone === "critical" && value ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-500"}`}><Icon className="h-4 w-4" /></div></div></CardContent></Card>;
}

function ActionRow({ item }: { item: Insight }) {
  const content = (
    <div className="group flex gap-3 px-5 py-4 transition-colors hover:bg-slate-50/80">
      <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.severity === "critical" ? "bg-rose-500" : item.severity === "warning" ? "bg-amber-400" : "bg-slate-300"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-900">{item.title}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{categoryLabels[item.category] || item.category}</span></div>
        <p className="mt-1 text-[13px] leading-5 text-slate-500">{item.detail}</p>
      </div>
      {item.actionUrl && <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />}
    </div>
  );
  return item.actionUrl ? <Link href={item.actionUrl}>{content}</Link> : content;
}

function ChannelCard({ channel: c }: { channel: Channel }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
      <div className="flex items-start justify-between gap-3"><div><div className="font-medium text-slate-900">{c.label}</div><div className="mt-0.5 text-[12px] text-slate-400">{c.leads} лидов → {c.won} продаж</div></div><div className="text-right"><div className="text-[13px] font-semibold text-slate-900">{rub(c.revenue)}</div><div className="text-[10px] text-slate-400">выручка</div></div></div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <TinyMetric label="Конверсия" value={`${c.conversion}%`} />
        <TinyMetric label="Цена лида" value={c.cpl ? rub(c.cpl) : "—"} />
        <TinyMetric label="Окупаемость" value={c.roas == null ? "—" : `${c.roas}×`} />
      </div>
      {c.spend > 0 && <div className="mt-3 text-[11px] text-slate-400">Потрачено за месяц: {rub(c.spend)}</div>}
    </div>
  );
}

function TinyMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white px-2 py-2.5"><div className="text-[10px] text-slate-400">{label}</div><div className="mt-1 text-[12px] font-medium text-slate-700">{value}</div></div>;
}
