import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, CalendarClock, CircleDollarSign, FileQuestion, MessageCircle, RefreshCcw } from "lucide-react";
import type { ContactIntelligence } from "@/lib/contact-intelligence";

function when(value: number | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

const labels: Record<string, string> = { email: "Email", telegram: "Telegram" };

const factStyles = {
  request: { wrap: "border-sky-100 bg-sky-50/55", icon: "bg-white text-sky-600", label: "text-sky-700/70" },
  budget: { wrap: "border-emerald-100 bg-emerald-50/55", icon: "bg-white text-emerald-600", label: "text-emerald-700/70" },
  deadline: { wrap: "border-amber-100 bg-amber-50/60", icon: "bg-white text-amber-600", label: "text-amber-700/70" },
  next: { wrap: "border-violet-100 bg-violet-50/55", icon: "bg-white text-violet-600", label: "text-violet-700/70" },
} as const;

export function ContactIntelligencePanel({ intelligence }: { intelligence: ContactIntelligence | null }) {
  if (!intelligence) {
    return (
      <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50/55 via-white to-white shadow-sm">
        <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Bot className="h-4 w-4" /></div>
          <div><b className="text-foreground">Контекст из диалогов</b><p className="mt-1 leading-5">Пока нет связанной переписки. Когда появятся email или Telegram-диалоги, помощник соберёт сюда запрос, бюджет, сроки и следующий шаг.</p></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-indigo-100 bg-white shadow-[0_8px_28px_rgba(79,70,229,.045)]">
      <div className="h-1 bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-400" />
      <CardHeader className="bg-gradient-to-br from-indigo-50/70 via-white to-white pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-100/80 text-indigo-700"><Bot className="h-[18px] w-[18px]" /></div>
            <div>
              <CardTitle className="text-base">Контекст из диалогов</CardTitle>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Здесь только то, что CRM нашла в реальной переписке: запрос клиента, деньги, срок и следующий шаг.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {intelligence.sourceChannels.map((channel) => <Badge key={channel} variant="outline" className="bg-white/80">{labels[channel] || channel}</Badge>)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Fact icon={FileQuestion} label="Что хочет клиент" value={intelligence.requestText} style={factStyles.request} />
          <Fact icon={CircleDollarSign} label="Бюджет / цена" value={intelligence.budgetText} style={factStyles.budget} />
          <Fact icon={CalendarClock} label="Срок" value={intelligence.deadlineText} style={factStyles.deadline} />
          <Fact icon={MessageCircle} label="Следующий шаг" value={intelligence.nextStep} style={factStyles.next} />
        </div>
        {intelligence.summary && <div className="rounded-2xl border border-slate-100 bg-slate-50/75 p-4 text-sm leading-6 whitespace-pre-line">{intelligence.summary}</div>}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-muted-foreground">
          <span>Последний диалог: {when(intelligence.lastDialogAt)}</span>
          <span>Проверено сообщений: {intelligence.evidenceCount}</span>
          <span>Заполнено автоматически: {intelligence.autoUpdates}</span>
          <span className="inline-flex items-center gap-1"><RefreshCcw className="h-3 w-3" />Обновлено {when(intelligence.extractedAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Fact({ icon: Icon, label, value, style }: {
  icon: typeof Bot;
  label: string;
  value: string | null;
  style: { wrap: string; icon: string; label: string };
}) {
  return (
    <div className={`rounded-2xl border p-3.5 ${style.wrap}`}>
      <div className={`flex items-center gap-2 text-xs font-medium ${style.label}`}>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg shadow-sm ${style.icon}`}><Icon className="h-3.5 w-3.5" /></span>
        {label}
      </div>
      <div className="mt-3 text-sm font-semibold leading-5 text-slate-900">{value || "Пока не найдено"}</div>
    </div>
  );
}
