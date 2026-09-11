"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { NotificationToggle } from "@/components/shared/NotificationToggle";
import {
  Bell,
  Bot,
  CheckCircle2,
  Copy,
  Kanban,
  Link2,
  Loader2,
  MessageCircle,
  PhoneIncoming,
  Send,
} from "lucide-react";
import { toast } from "sonner";

interface IntegrationState {
  telegramConfigured: boolean;
  telegramTokenConfigured: boolean;
  telegramChatId: string;
  needNumberProjectId: string;
  needNumberCreateDeal: boolean;
  needNumberWebhookPath: string;
}

export default function SettingsPage() {
  const [stages, setStages] = useState<
    Array<{ id: string; name: string; color: string; order: number }>
  >([]);
  const [integration, setIntegration] = useState<IntegrationState | null>(null);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [projectId, setProjectId] = useState("1474");
  const [createDeal, setCreateDeal] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const loadIntegration = async () => {
    const response = await fetch("/api/integrations/settings", { cache: "no-store" });
    if (!response.ok) throw new Error("Не удалось загрузить настройки интеграций");
    const data = (await response.json()) as IntegrationState;
    setIntegration(data);
    setTelegramChatId(data.telegramChatId || "");
    setProjectId(data.needNumberProjectId || "1474");
    setCreateDeal(data.needNumberCreateDeal);
  };

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/pipeline")
      .then((r) => r.json())
      .then(setStages)
      .catch(() => {});
    loadIntegration().catch((error) => toast.error(error.message));
  }, []);

  const webhookUrl = useMemo(() => {
    if (!integration?.needNumberWebhookPath) return "";
    return `${origin || "https://crm.satorilabural.online"}${integration.needNumberWebhookPath}`;
  }, [integration, origin]);

  const saveTelegram = async () => {
    setBusy("telegram-save");
    try {
      const response = await fetch("/api/integrations/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          telegramBotToken: telegramToken,
          telegramChatId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить Telegram");
      setTelegramToken("");
      setIntegration(data);
      setTelegramChatId(data.telegramChatId || telegramChatId);
      toast.success("Telegram сохранён");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally {
      setBusy(null);
    }
  };

  const discoverChat = async () => {
    setBusy("telegram-discover");
    try {
      const response = await fetch("/api/integrations/telegram/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ telegramBotToken: telegramToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chat ID не найден");
      setTelegramChatId(String(data.chatId));
      toast.success(
        data.firstName ? `Найден чат: ${data.firstName}` : `Chat ID найден: ${data.chatId}`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось найти chat ID");
    } finally {
      setBusy(null);
    }
  };

  const testTelegram = async () => {
    setBusy("telegram-test");
    try {
      const response = await fetch("/api/integrations/telegram/test", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Тест Telegram не прошёл");
      toast.success("Тестовое сообщение отправлено в Telegram");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка Telegram");
    } finally {
      setBusy(null);
    }
  };

  const saveNeedNumber = async () => {
    setBusy("need-number");
    try {
      const response = await fetch("/api/integrations/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          needNumberProjectId: projectId,
          needNumberCreateDeal: createDeal,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить Need Number");
      setIntegration(data);
      toast.success("Настройки Need Number сохранены");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally {
      setBusy(null);
    }
  };

  const copyWebhook = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL скопирован");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Настройки</h1>
        <p className="text-muted-foreground">
          Воронка, уведомления и подключения SATORI CRM
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Kanban className="h-4 w-4" />
              Этапы воронки
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stages.map((stage) => (
                <div
                  key={stage.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="text-sm flex-1">{stage.name}</span>
                  <Badge variant="outline" className="text-xs">#{stage.order}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Уведомления CRM
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <NotificationToggle />
            <p className="text-xs text-muted-foreground">
              Браузерные уведомления работают, пока CRM открыта. Telegram ниже будет получать новые лиды независимо от открытой вкладки.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Telegram
              </span>
              <Badge variant={integration?.telegramConfigured ? "default" : "outline"}>
                {integration?.telegramConfigured ? "Подключён" : "Не настроен"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <p><b>1.</b> Создайте бота через @BotFather и скопируйте его токен.</p>
              <p><b>2.</b> Откройте созданного бота и отправьте ему <code>/start</code>.</p>
              <p><b>3.</b> Вставьте токен ниже и нажмите «Найти chat ID».</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="telegram-token">Токен бота</Label>
              <Input
                id="telegram-token"
                type="password"
                autoComplete="off"
                placeholder={integration?.telegramTokenConfigured ? "Токен уже сохранён — оставьте пустым, чтобы не менять" : "123456789:AA..."}
                value={telegramToken}
                onChange={(event) => setTelegramToken(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Токен хранится только на сервере CRM и обратно в интерфейс не выводится.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="telegram-chat">Chat ID</Label>
              <div className="flex gap-2">
                <Input
                  id="telegram-chat"
                  placeholder="Например, 123456789"
                  value={telegramChatId}
                  onChange={(event) => setTelegramChatId(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={discoverChat}
                  disabled={busy !== null || (!telegramToken && !integration?.telegramTokenConfigured)}
                >
                  {busy === "telegram-discover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
                  Найти chat ID
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={saveTelegram} disabled={busy !== null || !telegramChatId}>
                {busy === "telegram-save" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Сохранить Telegram
              </Button>
              <Button
                variant="outline"
                onClick={testTelegram}
                disabled={busy !== null || !integration?.telegramConfigured}
              >
                {busy === "telegram-test" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Отправить тест
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PhoneIncoming className="h-4 w-4" />
              Need Number
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Новые номера Need Number будут автоматически создаваться в CRM, а после подключения Telegram — сразу приходить туда уведомлением.
            </p>

            <div className="space-y-2">
              <Label htmlFor="need-project">ID проекта Need Number</Label>
              <Input
                id="need-project"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                placeholder="1474"
              />
            </div>

            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <div className="flex gap-2">
                <code className="flex-1 text-xs bg-muted p-3 rounded-md break-all">
                  {webhookUrl || "Загрузка..."}
                </code>
                <Button variant="outline" size="icon" onClick={copyWebhook} disabled={!webhookUrl} title="Скопировать webhook">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={createDeal}
                onChange={(event) => setCreateDeal(event.target.checked)}
              />
              <span>
                <span className="text-sm font-medium block">Автоматически создавать сделку</span>
                <span className="text-xs text-muted-foreground">Новый номер попадёт в первый активный этап воронки. Повторный номер не создаст дубль клиента.</span>
              </span>
            </label>

            <Button onClick={saveNeedNumber} disabled={busy !== null}>
              {busy === "need-number" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Сохранить Need Number
            </Button>

            <Separator />

            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <p className="font-medium flex items-center gap-2"><Link2 className="h-4 w-4" /> Как подключить</p>
              <p><b>1.</b> В проекте Need Number №{projectId || "1474"} выберите передачу данных по webhook.</p>
              <p><b>2.</b> Вставьте URL выше и используйте метод <code>POST</code>.</p>
              <p><b>3.</b> Дополнительные заголовки не нужны — секрет уже зашит в URL.</p>
              <p><b>4.</b> После первого лида номер появится в «Клиентах» и, если включено, в «Воронке».</p>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              Дубли проверяются по нормализованному номеру телефона.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
