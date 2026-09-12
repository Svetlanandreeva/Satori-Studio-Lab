"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Bot, CheckCircle2, CircleDollarSign, Clock3, RefreshCw, Sparkles, TrendingUp, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  latestRun: null | { run_at?: number; critical_count?: number; warning_count?: number; cleaned_duplicates?: number; cleaned_activity_duplicates?: number; summary?: Record<string, unknown> };
  insights: Insight[]; channels: Channel[]; month: string;
};

function rub(value: number) { return `${Math.round((value || 0) / 100).toLocaleString("ru-RU")} ₽`; }
function when(value?: number) {
  if (!value) return "ещё не запускался";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

const categoryLabels: Record<string, string> = {
  clients: "Клиенты", messages: "Сообщения", projects: "Проекты", finance: "Финансы", channels: "Каналы", crm: "CRM",
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
      toast.success("CRM проверена и очищена");
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
      setState(data); setSpend(""); toast.success("Расход канала обновлён");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); }
    finally { setBusy(false); }
  };

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []);
  const critical = useMemo(() => state?.insights.filter(x => x.severity === "critical") || [], [state]);
  const warning = useMemo(() => state?.insights.filter(x => x.severity === "warning") || [], [state]);
  const cleanup = Number(state?.latestRun?.cleaned_duplicates || 0) + Number(state?.latestRun?.cleaned_activity_duplicates || 0);

  if (!state) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> Загружаю состояние бизнеса…</div>;

  return (
    <div className="space-y-6 max-w-[1500px]">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> Satori Intelligence</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Помощник</h1>
          <p className="mt-1 text-sm text-muted-foreground">Каждый час проверяет клиентов, чаты, проекты, деньги, каналы и качество CRM.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Последняя проверка: {when(Number(state.latestRun?.run_at || 0))}</span>
          <Button onClick={run} disabled={busy}>{busy ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}Проверить сейчас</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={AlertCircle} label="Срочно" value={critical.length} note="нужно сделать сейчас" />
        <Metric icon={Clock3} label="Требует внимания" value={warning.length} note="follow-up, сроки, экономика" />
        <Metric icon={Wrench} label="CRM очищено" value={cleanup} note="дубли за последний запуск" />
        <Metric icon={TrendingUp} label="Каналов в анализе" value={state.channels.length} note="30 дней + расходы месяца" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20"><CardTitle className="text-base">Что сделать в первую очередь</CardTitle></CardHeader>
          <CardContent className="p-0">
            {!state.insights.length ? <div className="p-8 text-center text-sm text-muted-foreground"><CheckCircle2 className="mx-auto mb-2 h-7 w-7" />Критичных сигналов сейчас нет.</div> :
              <div className="divide-y">{state.insights.slice(0, 18).map((item) => <InsightRow key={item.id} item={item} />)}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Расходы на каналы · {state.month}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Вносим рекламный бюджет и стоимость парсера — помощник считает CPL, CAC и ROAS на фактических лидах и продажах CRM.</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">
                <option value="need_number">Парсер / Need Number</option><option value="ads">Реклама</option><option value="website">Сайт</option>
                <option value="instagram">Instagram</option><option value="linkedin">LinkedIn</option><option value="telegram_account">Telegram</option><option value="other">Другое</option>
              </select>
              <Input inputMode="decimal" value={spend} onChange={(e) => setSpend(e.target.value)} placeholder="₽ за месяц" />
              <Button variant="outline" onClick={saveSpend} disabled={busy}>Сохранить</Button>
            </div>
            <div className="rounded-xl bg-muted/35 p-4 text-xs text-muted-foreground">Расходы бизнеса, подрядчики, налоги и производство берутся из «Экономики». Здесь — только стоимость привлечения по каналам.</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><div><CardTitle className="text-base">Эффективность каналов</CardTitle><p className="mt-1 text-xs text-muted-foreground">Лиды — последние 30 дней. Выручка и прибыль — по связанным сделкам.</p></div><CircleDollarSign className="h-5 w-5 text-muted-foreground" /></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground">
            <th className="pb-3 font-medium">Канал</th><th className="pb-3 font-medium">Лиды</th><th className="pb-3 font-medium">Сделки</th><th className="pb-3 font-medium">Продажи</th><th className="pb-3 font-medium">Конверсия</th><th className="pb-3 font-medium">Расход</th><th className="pb-3 font-medium">CPL</th><th className="pb-3 font-medium">CAC</th><th className="pb-3 font-medium">Выручка</th><th className="pb-3 font-medium">ROAS</th>
          </tr></thead><tbody>{state.channels.map((c) => <tr key={c.source} className="border-b last:border-0"><td className="py-3 font-medium">{c.label}</td><td>{c.leads}</td><td>{c.deals}</td><td>{c.won}</td><td>{c.conversion}%</td><td>{rub(c.spend)}</td><td>{c.cpl ? rub(c.cpl) : "—"}</td><td>{c.cac ? rub(c.cac) : "—"}</td><td>{rub(c.revenue)}</td><td>{c.roas == null ? "—" : `${c.roas}×`}</td></tr>)}</tbody></table>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ icon: Icon, label, value, note }: { icon: typeof Users; label: string; value: number; note: string }) {
  return <Card><CardContent className="p-4"><div className="flex items-start justify-between"><div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-3xl font-semibold tracking-tight">{value}</div><div className="mt-1 text-xs text-muted-foreground">{note}</div></div><div className="rounded-xl bg-muted p-2"><Icon className="h-4 w-4" /></div></div></CardContent></Card>;
}

function InsightRow({ item }: { item: Insight }) {
  const content = <div className="flex gap-3 p-4 transition-colors hover:bg-muted/30"><div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.severity === "critical" ? "bg-red-500" : item.severity === "warning" ? "bg-amber-500" : "bg-slate-400"}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{item.title}</span><Badge variant="outline" className="text-[10px]">{categoryLabels[item.category] || item.category}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{item.detail}</p></div></div>;
  return item.actionUrl ? <Link href={item.actionUrl}>{content}</Link> : content;
}
