"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Factory, MessageCircle, RefreshCw, Sparkles, Target, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Movement = { current: number; previous: number; delta: number };
type Brief = {
  generatedAt: number;
  periodLabel: string;
  leads: Movement;
  deals: Movement;
  won: Movement;
  messages: { incoming24h: number; unanswered: number };
  projects: { activeProduction: number; overdue: number; dueSoon: number; due7: number; due14: number };
  finance: { monthReceived: number; monthDealCosts: number; monthBusinessExpenses: number; monthNet: number; margin: number };
  pipeline: { activeValue: number; weightedValue: number };
  channels: Array<{ source: string; leads24h: number; previous24h: number; delta: number }>;
  crm: { openErrors: number; enrichedProfiles: number };
  topActions: Array<{ severity: string; title: string; detail: string; actionUrl: string | null }>;
};

type State = {
  dailyBrief?: Brief;
  dialogueEnrichment?: { contactsScanned?: number; profilesUpdated?: number; fieldsFilled?: number } | null;
};

const sourceLabels: Record<string, string> = {
  need_number: "Парсер",
  website: "Сайт",
  ads: "Реклама",
  email: "Email",
  telegram: "Telegram-бот",
  telegram_account: "Telegram",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  referral: "Рекомендации",
  other: "Другое",
  otro: "Другое",
};

function rub(value: number) {
  return `${Math.round((value || 0) / 100).toLocaleString("ru-RU")} ₽`;
}

function Delta({ value }: { value: number }) {
  if (!value) return <span className="text-xs text-muted-foreground">без изменений</span>;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${value > 0 ? "text-emerald-600" : "text-rose-600"}`}>
      {value > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {value > 0 ? "+" : ""}{value} к предыдущим 24 ч.
    </span>
  );
}

export function DailyBriefPanel() {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    fetch("/api/assistant", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Не удалось загрузить итог");
        setState(data);
      })
      .catch(() => setState({}));
  }, []);

  const brief = state?.dailyBrief;
  if (!state) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> Готовлю управленческий итог…</div>;
  }
  if (!brief) return null;

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> Управленческий итог</div>
            <CardTitle className="mt-1 text-xl">Что изменилось за последние 24 часа</CardTitle>
          </div>
          <div className="text-xs text-muted-foreground">Обновлено {new Intl.DateTimeFormat("ru-RU", { timeStyle: "short", dateStyle: "short" }).format(new Date(brief.generatedAt))}</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MiniMetric icon={Users} label="Новые лиды" value={brief.leads.current} extra={<Delta value={brief.leads.delta} />} />
          <MiniMetric icon={Target} label="Новые сделки" value={brief.deals.current} extra={<Delta value={brief.deals.delta} />} />
          <MiniMetric icon={CircleDollarSign} label="Продажи" value={brief.won.current} extra={<Delta value={brief.won.delta} />} />
          <MiniMetric icon={MessageCircle} label="Входящих сообщений" value={brief.messages.incoming24h} extra={<span className="text-xs text-muted-foreground">без ответа: {brief.messages.unanswered}</span>} />
          <MiniMetric icon={Factory} label="В производстве" value={brief.projects.activeProduction} extra={<span className="text-xs text-muted-foreground">просрочено: {brief.projects.overdue} · горят: {brief.projects.dueSoon}</span>} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">Финансы текущего месяца</p>
                <p className="text-xs text-muted-foreground">Поступления минус прямые расходы по сделкам и расходы бизнеса.</p>
              </div>
              <Badge variant="outline">Маржа {brief.finance.margin}%</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Money label="Получено" value={brief.finance.monthReceived} />
              <Money label="По сделкам" value={brief.finance.monthDealCosts} />
              <Money label="Расходы бизнеса" value={brief.finance.monthBusinessExpenses} />
              <Money label="Итог" value={brief.finance.monthNet} emphasize />
            </div>
            <div className="mt-4 border-t pt-3 text-sm">
              <span className="text-muted-foreground">Активная воронка: </span><b>{rub(brief.pipeline.activeValue)}</b>
              <span className="mx-2 text-muted-foreground">·</span>
              <span className="text-muted-foreground">взвешенный прогноз: </span><b>{rub(brief.pipeline.weightedValue)}</b>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <p className="font-medium">Загрузка и каналы</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">до 7 дней</div><div className="mt-1 text-xl font-semibold">{brief.projects.due7}</div></div>
              <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">до 14 дней</div><div className="mt-1 text-xl font-semibold">{brief.projects.due14}</div></div>
              <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">ошибок CRM</div><div className="mt-1 text-xl font-semibold">{brief.crm.openErrors}</div></div>
            </div>
            <div className="mt-3 space-y-2">
              {brief.channels.slice(0, 4).map((channel) => (
                <div key={channel.source} className="flex items-center justify-between text-sm">
                  <span>{sourceLabels[channel.source] || channel.source}</span>
                  <span className="text-muted-foreground">{channel.leads24h} лид. {channel.delta ? `(${channel.delta > 0 ? "+" : ""}${channel.delta})` : ""}</span>
                </div>
              ))}
              {!brief.channels.length && <p className="text-sm text-muted-foreground">Новых лидов по каналам за сутки нет.</p>}
            </div>
          </div>
        </div>

        {(state.dialogueEnrichment?.fieldsFilled || 0) > 0 && (
          <div className="rounded-xl border bg-muted/20 p-3 text-sm">
            Помощник прочитал новые диалоги и автоматически дополнил <b>{state.dialogueEnrichment?.fieldsFilled}</b> полей в карточках клиентов. Обработано профилей: {state.dialogueEnrichment?.profilesUpdated || 0}.
          </div>
        )}

        {!!brief.topActions.length && (
          <div>
            <p className="mb-2 font-medium">Главное на сегодня</p>
            <div className="grid gap-2 md:grid-cols-2">
              {brief.topActions.slice(0, 4).map((action, index) => {
                const content = <div className="rounded-lg border p-3"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${action.severity === "critical" ? "bg-red-500" : "bg-amber-500"}`} /><span className="font-medium">{action.title}</span></div><p className="mt-1 text-sm text-muted-foreground">{action.detail}</p></div>;
                return action.actionUrl ? <Link key={index} href={action.actionUrl}>{content}</Link> : <div key={index}>{content}</div>;
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniMetric({ icon: Icon, label, value, extra }: { icon: typeof Users; label: string; value: number; extra: React.ReactNode }) {
  return <div className="rounded-xl border p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div><div className="mt-1">{extra}</div></div>;
}

function Money({ label, value, emphasize = false }: { label: string; value: number; emphasize?: boolean }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-lg ${emphasize ? "font-semibold" : "font-medium"}`}>{rub(value)}</div></div>;
}
