"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2, MessageCircle, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

interface IntegrationState {
  telegramConfigured: boolean;
  telegramTokenConfigured: boolean;
  telegramInboundConfigured: boolean;
  telegramBusinessConfigured: boolean;
  telegramBusinessCanReply: boolean;
}

interface TestTarget {
  bot?: { username?: string; name?: string } | null;
  recipient?: { username?: string; name?: string; type?: string } | null;
}

export default function TelegramBusinessSettingsPage() {
  const [state, setState] = useState<IntegrationState | null>(null);
  const [target, setTarget] = useState<TestTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/integrations/settings", { cache: "no-store" });
      const data = (await response.json()) as IntegrationState & { error?: string };
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

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Личный Telegram → CRM</h1>
        <p className="text-muted-foreground mt-1">
          Переписки, которые клиенты пишут прямо вашему Telegram-аккаунту, без общения с ботом.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> Telegram Business
            </span>
            <Badge variant={state?.telegramBusinessConfigured ? "default" : "outline"}>
              {state?.telegramBusinessConfigured ? "Личный аккаунт подключён" : "Ждёт подключения"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Бот CRM</div>
              <div className="font-medium mt-1">{state?.telegramTokenConfigured ? "Готов" : "Не настроен"}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Webhook</div>
              <div className="font-medium mt-1">{state?.telegramInboundConfigured ? "Готов" : "Не подключён"}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Ответ из CRM</div>
              <div className="font-medium mt-1">{state?.telegramBusinessCanReply ? "Разрешён" : "Нет разрешения"}</div>
            </div>
          </div>

          {target && (
            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium">Куда приходят уведомления CRM</div>
              <div className="mt-1 text-muted-foreground">
                Получатель: {target.recipient?.username ? `@${target.recipient.username.replace(/^@/, "")}` : target.recipient?.name || "не определён"}
                {target.bot?.username ? ` · бот @${target.bot.username.replace(/^@/, "")}` : ""}
              </div>
            </div>
          )}

          {state?.telegramBusinessConfigured ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-sm">
              <div className="font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Личный Telegram подключён
              </div>
              <p className="mt-2 text-muted-foreground">
                Новые входящие личные сообщения будут создавать или находить клиента в CRM, попадать в его историю, а отвечать можно через CRM от имени подключённого Telegram-аккаунта.
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-3">
              <p className="font-medium">Подключение занимает один раз несколько минут:</p>
              <p><b>1.</b> Откройте @BotFather → ваш CRM-бот → Bot Settings → включите <b>Business Mode</b>.</p>
              <p><b>2.</b> В Telegram откройте <b>Настройки → Telegram Business → Чат-боты / Connected Bots</b> и подключите этот CRM-бот.</p>
              <p><b>3.</b> Дайте боту доступ к нужным личным чатам и разрешение отвечать от вашего имени.</p>
              <p><b>4.</b> Вернитесь сюда и нажмите «Обновить статус». После подключения Telegram сам пришлёт CRM защищённое событие.</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={load} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Обновить статус
            </Button>
            <Button variant="outline" onClick={testNotifications} disabled={busy || !state?.telegramConfigured}>
              <Send className="mr-2 h-4 w-4" />
              Проверить уведомления
            </Button>
            <Button variant="outline" onClick={() => { window.location.href = "/settings"; }}>
              Обычные настройки Telegram
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Как будет работать</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Клиент пишет вашему обычному Telegram-аккаунту → сообщение появляется в CRM и привязывается к клиенту.</p>
          <p>Если клиента ещё нет → CRM создаёт нового тёплого лида и сделку в первом рабочем этапе.</p>
          <p>Ваши ответы из CRM отправляются в тот же личный диалог от имени подключённого Telegram-аккаунта.</p>
        </CardContent>
      </Card>
    </div>
  );
}
