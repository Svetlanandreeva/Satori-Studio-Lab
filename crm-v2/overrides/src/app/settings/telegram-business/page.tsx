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

  const inboundOk = Boolean(
    state?.webhookConfigured &&
      state?.webhookHealthy &&
      state?.businessUpdatesSubscribed &&
      state?.businessConfigured &&
      state?.businessEnabled
  );
  const overallOk = Boolean(state?.tokenConfigured && inboundOk && state?.businessCanReply);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Личный Telegram → CRM</h1>
        <p className="text-muted-foreground mt-1">
          Официальное подключение Telegram Business: входящие и исходящие личного аккаунта попадают в «Сообщения», а отвечать можно прямо из CRM.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> Telegram Business
            </span>
            <Badge variant={overallOk ? "default" : "outline"}>
              {overallOk ? "Готов к работе" : "Требует проверки"}
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
              label="Входящие"
              ok={inboundOk}
              good="Доходят в CRM"
              bad={state?.webhookConfigured ? "Нужна переподписка" : "Webhook не подключён"}
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
              good="Разрешён Telegram"
              bad="Нет разрешения"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3 text-sm">
              <div className="text-xs text-muted-foreground">Последнее событие Telegram → CRM</div>
              <div className="mt-1 font-medium">{dateTime(state?.lastWebhookUpdateAt)}</div>
              {state?.lastWebhookUpdateType && <div className="mt-1 text-xs text-muted-foreground">{state.lastWebhookUpdateType}</div>}
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <div className="text-xs text-muted-foreground">Последний диалог личного аккаунта</div>
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

          {inboundOk ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-sm">
              <div className="font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Канал личного Telegram подключён
              </div>
              <p className="mt-2 text-muted-foreground">
                Новые входящие сообщения и сообщения, которые вы отправляете из самого Telegram, зеркалируются в CRM. Ответ из CRM уходит в тот же диалог от имени подключённого Business-аккаунта.
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
              <p className="font-medium">Чего сейчас не хватает</p>
              {!state?.businessConfigured && <p>Telegram ещё не передал CRM активный Business Connection.</p>}
              {state?.businessConfigured && !state?.webhookHealthy && <p>Business Connection есть, но доставка webhook сейчас нездорова.</p>}
              {!state?.businessUpdatesSubscribed && <p>Webhook не подписан на все Business-события.</p>}
              <p className="text-muted-foreground">Нажмите «Проверить и восстановить» — сервер перепроверит Telegram и сам переподпишет webhook при необходимости.</p>
            </div>
          )}

          {state?.businessConfigured && (
            <div className="rounded-lg border p-3 text-xs text-muted-foreground">
              {state.businessCanReadMessages
                ? "Telegram также разрешил боту отмечать входящие сообщения прочитанными."
                : "Право «отмечать прочитанными» не выдано — это не мешает получать новые сообщения в CRM."}
              {state.businessCanReply
                ? " Ответы из CRM разрешены для диалогов, где Telegram позволяет Business-боту отвечать; официальный Bot API обычно ограничивает это недавними входящими сообщениями."
                : " Чтобы отвечать из CRM, в настройках Telegram Business нужно дать подключённому боту право отвечать."}
            </div>
          )}

          {target && (
            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium">Куда приходят служебные уведомления CRM</div>
              <div className="mt-1 text-muted-foreground">
                Получатель: {target.recipient?.username ? `@${target.recipient.username.replace(/^@/, "")}` : target.recipient?.name || "не определён"}
                {target.bot?.username ? ` · бот @${target.bot.username.replace(/^@/, "")}` : ""}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={load} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Проверить и восстановить
            </Button>
            <Button variant="outline" onClick={testNotifications} disabled={busy || !state?.tokenConfigured}>
              <Send className="mr-2 h-4 w-4" />
              Проверить уведомления
            </Button>
            <Button variant="outline" onClick={() => { window.location.href = "/inbox"; }}>
              <MessageCircle className="mr-2 h-4 w-4" />
              Открыть сообщения
            </Button>
            <Button variant="outline" onClick={() => { window.location.href = "/settings"; }}>
              Назад в настройки
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Как теперь работает</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Клиент пишет обычному Telegram-аккаунту Satori → Telegram Business отправляет событие в CRM.</p>
          <p>Если вы сами начали диалог в приложении Telegram, он тоже появляется в CRM и создаёт карточку контакта без лишней сделки.</p>
          <p>Ответ из «Сообщений» CRM отправляется обратно в тот же личный диалог от имени подключённого аккаунта.</p>
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
