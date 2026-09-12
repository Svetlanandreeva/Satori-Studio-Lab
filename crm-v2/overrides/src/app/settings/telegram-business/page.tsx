"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

interface TelegramStatus {
  tokenConfigured: boolean;
  webhookConfigured: boolean;
  webhookHealthy: boolean;
  expectedWebhookUrl?: string;
  webhookUrl?: string;
  pendingUpdates?: number;
  webhookLastError?: string;
  webhookLastErrorAt?: string | null;
  allowedUpdates?: string[];
  businessUpdatesSubscribed?: boolean;
  businessConfigured: boolean;
  businessConnectionId?: string | null;
  businessEnabled: boolean;
  businessCanReply: boolean;
  businessCanReadMessages: boolean;
  businessError?: string;
  businessUser?: { id: number; username?: string | null; name?: string | null } | null;
  lastWebhookUpdateAt?: string | null;
  lastWebhookUpdateType?: string | null;
  lastBusinessMessageAt?: string | null;
}

interface TestTarget {
  bot?: { username?: string; name?: string } | null;
  recipient?: { username?: string; name?: string; type?: string } | null;
}

function dateTime(value?: string | null) {
  if (!value) return "Ещё не получали";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default function TelegramBusinessSettingsPage() {
  const [state, setState] = useState<TelegramStatus | null>(null);
  const [target, setTarget] = useState<TestTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/integrations/telegram/status", { cache: "no-store" });
      const data = (await response.json()) as TelegramStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось получить статус Telegram");
      setState(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка Telegram");
    } finally {
      setBusy(false);
    }
  };

  const testNotifications = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/integrations/telegram/test", { method: "POST" });
      const data = (await response.json()) as TestTarget & { error?: string };
      if (!response.ok) throw new Error(data.error || "Тест Telegram не прошёл");
      setTarget(data);
      const recipient = data.recipient?.username
        ? `@${data.recipient.username.replace(/^@/, "")}`
        : data.recipient?.name || "сохранённый чат";
      toast.success(`Тест отправлен: ${recipient}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка Telegram");
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const overallOk = Boolean(
    state?.tokenConfigured &&
      state?.webhookConfigured &&
      state?.webhookHealthy &&
      state?.businessUpdatesSubscribed &&
      state?.businessConfigured &&
      state?.businessEnabled
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Личный Telegram → CRM</h1>
        <p className="text-muted-foreground mt-1">
          Здесь показывается не просто наличие токена, а реальная доставка событий Telegram Business в CRM.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> Telegram Business
            </span>
            <Badge variant={overallOk ? "default" : "outline"}>
              {overallOk ? "Работает" : "Требует проверки"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatusBox
              label="Бот CRM"
              ok={Boolean(state?.tokenConfigured)}
              good="Токен готов"
              bad="Не настроен"
            />
            <StatusBox
              label="Доставка webhook"
              ok={Boolean(state?.webhookConfigured && state?.webhookHealthy && state?.businessUpdatesSubscribed)}
              good="Business-события включены"
              bad={state?.webhookConfigured ? "Нужна переподписка" : "Не подключён"}
            />
            <StatusBox
              label="Личный аккаунт"
              ok={Boolean(state?.businessConfigured && state?.businessEnabled)}
              good="Подключён"
              bad="Нет активной связи"
            />
            <StatusBox
              label="Ответ из CRM"
              ok={Boolean(state?.businessCanReply)}
              good="Разрешён"
              bad="Нет разрешения"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3 text-sm">
              <div className="text-xs text-muted-foreground">Последнее событие, дошедшее до webhook</div>
              <div className="mt-1 font-medium">{dateTime(state?.lastWebhookUpdateAt)}</div>
              {state?.lastWebhookUpdateType && <div className="mt-1 text-xs text-muted-foreground">{state.lastWebhookUpdateType}</div>}
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <div className="text-xs text-muted-foreground">Последнее личное сообщение, записанное CRM</div>
              <div className="mt-1 font-medium">{dateTime(state?.lastBusinessMessageAt)}</div>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <div className="text-xs text-muted-foreground">Очередь Telegram</div>
              <div className="mt-1 font-medium">{state?.pendingUpdates || 0} событий</div>
            </div>
          </div>

          {(state?.webhookLastError || state?.businessError) && (
            <div className="rounded-lg border border-red-200 bg-red-50/60 p-4 text-sm text-red-800">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" /> Telegram сообщает ошибку
              </div>
              {state.webhookLastError && (
                <p className="mt-2">
                  Webhook: {state.webhookLastError}
                  {state.webhookLastErrorAt ? ` · ${dateTime(state.webhookLastErrorAt)}` : ""}
                </p>
              )}
              {state.businessError && <p className="mt-1">Business: {state.businessError}</p>}
            </div>
          )}

          {state?.businessConfigured && state?.businessCanReadMessages ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-sm">
              <div className="font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Доступ к личным сообщениям подтверждён Telegram
              </div>
              <p className="mt-2 text-muted-foreground">
                Аккаунт подключён, права на чтение и ответы видны через Telegram API. Новое сообщение в доступном личном чате должно появляться в «Сообщениях» CRM.
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
              <p className="font-medium">Что CRM ещё не получила от Telegram</p>
              {!state?.businessConfigured && <p>Нет активного Business Connection. После восстановления webhook Telegram должен дослать ожидающие события.</p>}
              {state?.businessConfigured && !state?.businessCanReadMessages && <p>Telegram не сообщает право чтения сообщений для текущего подключения.</p>}
              <p className="text-muted-foreground">Настройки на телефоне могут быть включены правильно — этот блок показывает именно то, что реально видит сервер CRM.</p>
            </div>
          )}

          {target && (
            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium">Куда приходят уведомления CRM</div>
              <div className="mt-1 text-muted-foreground">
                Получатель: {target.recipient?.username ? `@${target.recipient.username.replace(/^@/, "")}` : target.recipient?.name || "не определён"}
                {target.bot?.username ? ` · бот @${target.bot.username.replace(/^@/, "")}` : ""}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={load} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Проверить сейчас
            </Button>
            <Button variant="outline" onClick={testNotifications} disabled={busy || !state?.tokenConfigured}>
              <Send className="mr-2 h-4 w-4" />
              Проверить уведомления
            </Button>
            <Button variant="outline" onClick={() => { window.location.href = "/settings"; }}>
              Назад в настройки
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Как будет работать</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Клиент пишет обычному Telegram-аккаунту Satori → Telegram Business отправляет событие в CRM.</p>
          <p>CRM находит клиента или создаёт нового лида, а сообщение появляется в общей вкладке «Сообщения».</p>
          <p>Ответ из CRM отправляется обратно в тот же личный диалог от имени подключённого аккаунта.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBox({
  label,
  ok,
  good,
  bad,
}: {
  label: string;
  ok: boolean;
  good: string;
  bad: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-medium ${ok ? "text-emerald-700" : "text-amber-700"}`}>
        {ok ? good : bad}
      </div>
    </div>
  );
}
