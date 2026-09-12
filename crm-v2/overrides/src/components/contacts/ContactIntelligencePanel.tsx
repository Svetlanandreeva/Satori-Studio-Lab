import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, CalendarClock, CircleDollarSign, FileQuestion, MessageCircle, RefreshCcw } from "lucide-react";
import type { ContactIntelligence } from "@/lib/contact-intelligence";

function when(value: number | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

const labels: Record<string, string> = { email: "Email", telegram: "Telegram" };

export function ContactIntelligencePanel({ intelligence }: { intelligence: ContactIntelligence | null }) {
  if (!intelligence) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
          <Bot className="mt-0.5 h-4 w-4 shrink-0" />
          <div><b className="text-foreground">Контекст из диалогов</b><p className="mt-1">Пока нет связанной переписки. Когда появятся email или Telegram-диалоги, помощник соберёт сюда запрос, бюджет, сроки и следующий шаг.</p></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /><CardTitle className="text-base">Контекст из диалогов</CardTitle></div>
            <p className="mt-1 text-xs text-muted-foreground">Помощник читает связанную переписку каждый час и заполняет только явно подтверждённые данные.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {intelligence.sourceChannels.map((channel) => <Badge key={channel} variant="outline">{labels[channel] || channel}</Badge>)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Fact icon={FileQuestion} label="Что хочет клиент" value={intelligence.requestText} />
          <Fact icon={CircleDollarSign} label="Бюджет / цена" value={intelligence.budgetText} />
          <Fact icon={CalendarClock} label="Срок" value={intelligence.deadlineText} />
          <Fact icon={MessageCircle} label="Следующий шаг" value={intelligence.nextStep} />
        </div>
        {intelligence.summary && <div className="rounded-xl bg-muted/35 p-4 text-sm whitespace-pre-line">{intelligence.summary}</div>}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          <span>Последний диалог: {when(intelligence.lastDialogAt)}</span>
          <span>Проверено сообщений: {intelligence.evidenceCount}</span>
          <span>Автоматически заполнено полей: {intelligence.autoUpdates}</span>
          <span className="inline-flex items-center gap-1"><RefreshCcw className="h-3 w-3" />Обновлено {when(intelligence.extractedAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Bot; label: string; value: string | null }) {
  return <div className="rounded-xl border p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div><div className="mt-2 text-sm font-medium leading-5">{value || "Пока не найдено"}</div></div>;
}
