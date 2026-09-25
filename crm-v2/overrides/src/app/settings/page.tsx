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
  Mail,
  MessageCircle,
  PhoneIncoming,
  RefreshCw,
  Send,
  ShieldCheck,
  WandSparkles,
  ChevronDown,
  Activity,
} from "lucide-react";
import { toast } from "sonner";

interface IntegrationState {
  telegramConfigured: boolean;
  telegramTokenConfigured: boolean;
  telegramChatId: string;
  needNumberProjectId: string;
  needNumberCreateDeal: boolean;
  needNumberWebhookPath: string;
  emailConfigured: boolean;
  emailPasswordConfigured: boolean;
  emailAddress: string;
  emailUsername: string;
  emailImapHost: string;
  emailImapPort: number;
  emailImapSecure: boolean;
  emailSmtpHost: string;
  emailSmtpPort: number;
  emailSmtpSecure: boolean;
  emailFromName: string;
  emailIgnoreSenders: string;
  emailIgnoreSubjects: string;
  emailSyncDays: number;
  emailLastSyncAt: string;
  emailLastSyncError: string;
}

interface MailForm {
  address: string;
  username: string;
  password: string;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  fromName: string;
  ignoreSenders: string;
  ignoreSubjects: string;
  syncDays: string;
}

const emptyMail: MailForm = {
  address: "",
  username: "",
  password: "",
  imapHost: "",
  imapPort: "993",
  imapSecure: true,
  smtpHost: "",
  smtpPort: "465",
  smtpSecure: true,
  fromName: "Satori Studio",
  ignoreSenders: "",
  ignoreSubjects: "",
  syncDays: "365",
};

function mailPreset(address: string): Partial<MailForm> {
  const domain = address.trim().toLowerCase().split("@")[1] || "";
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return { imapHost: "imap.gmail.com", imapPort: "993", imapSecure: true, smtpHost: "smtp.gmail.com", smtpPort: "465", smtpSecure: true };
  }
  if (domain.includes("yandex.")) {
    return { imapHost: "imap.yandex.ru", imapPort: "993", imapSecure: true, smtpHost: "smtp.yandex.ru", smtpPort: "465", smtpSecure: true };
  }
  if (["mail.ru", "inbox.ru", "bk.ru", "list.ru"].includes(domain)) {
    return { imapHost: "imap.mail.ru", imapPort: "993", imapSecure: true, smtpHost: "smtp.mail.ru", smtpPort: "465", smtpSecure: true };
  }
  if (["outlook.com", "hotmail.com", "live.com"].includes(domain)) {
    return { imapHost: "outlook.office365.com", imapPort: "993", imapSecure: true, smtpHost: "smtp.office365.com", smtpPort: "587", smtpSecure: false };
  }
  if (domain) {
    return { imapHost: `imap.${domain}`, imapPort: "993", imapSecure: true, smtpHost: `smtp.${domain}`, smtpPort: "465", smtpSecure: true };
  }
  return {};
}

function lastSyncText(value: string) {
  if (!value) return "Ещё не синхронизировалась";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(date);
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
  const [mail, setMail] = useState<MailForm>(emptyMail);
  const [busy, setBusy] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");
  const [openAiModels, setOpenAiModels] = useState<string[]>([]);
  const [openAiModelsError, setOpenAiModelsError] = useState("");
  const [openAi, setOpenAi] = useState<{configured:boolean;masked:string;model:string;baseUrl:string}>({configured:false,masked:"",model:"gpt-5.4-mini",baseUrl:"https://api.openai.com/v1"});
  const [openSections,setOpenSections]=useState<Record<string,boolean>>({ai:true});
  const [health,setHealth]=useState<Record<string,"ok"|"error"|"unknown">>({telegram:"unknown",email:"unknown",ai:"unknown",need:"unknown"});
  const toggleSection=(key:string)=>setOpenSections(v=>({...v,[key]:!v[key]}));
  const statusBadge=(state:"ok"|"error"|"unknown",configured:boolean,label="Подключено") => (
    <Badge variant={state==="error"?"destructive":configured?"default":"outline"}>{state==="error"?"Ошибка":configured?(state==="ok"?label:"Настроено"):"Не подключено"}</Badge>
  );

  const loadIntegration = async () => {
    const response = await fetch("/api/integrations/settings", { cache: "no-store" });
    if (!response.ok) throw new Error("Не удалось загрузить настройки интеграций");
    const data = (await response.json()) as IntegrationState;
    setIntegration(data);
    setTelegramChatId(data.telegramChatId || "");
    setProjectId(data.needNumberProjectId || "1474");
    setCreateDeal(data.needNumberCreateDeal);
    setMail({
      address: data.emailAddress || "",
      username: data.emailUsername || data.emailAddress || "",
      password: "",
      imapHost: data.emailImapHost || "",
      imapPort: String(data.emailImapPort || 993),
      imapSecure: data.emailImapSecure ?? true,
      smtpHost: data.emailSmtpHost || "",
      smtpPort: String(data.emailSmtpPort || 465),
      smtpSecure: data.emailSmtpSecure ?? true,
      fromName: data.emailFromName || "Satori Studio",
      ignoreSenders: data.emailIgnoreSenders || "",
      ignoreSubjects: data.emailIgnoreSubjects || "",
      syncDays: String(data.emailSyncDays || 365),
    });
  };

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/pipeline")
      .then((r) => r.json())
      .then(setStages)
      .catch(() => {});
    loadIntegration().catch((error) => toast.error(error.message));
    fetch("/api/integrations/openai", { cache: "no-store" }).then(r => r.json()).then(setOpenAi).catch(() => {});
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
      setHealth(v=>({...v,telegram:"ok"})); toast.success("Тестовое сообщение отправлено в Telegram");
    } catch (error) {
      setHealth(v=>({...v,telegram:"error"})); toast.error(error instanceof Error ? error.message : "Ошибка Telegram");
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

  const emailPayload = () => ({
    emailAddress: mail.address,
    emailUsername: mail.username || mail.address,
    emailPassword: mail.password,
    emailImapHost: mail.imapHost,
    emailImapPort: Number(mail.imapPort) || 993,
    emailImapSecure: mail.imapSecure,
    emailSmtpHost: mail.smtpHost,
    emailSmtpPort: Number(mail.smtpPort) || 465,
    emailSmtpSecure: mail.smtpSecure,
    emailFromName: mail.fromName,
    emailIgnoreSenders: mail.ignoreSenders,
    emailIgnoreSubjects: mail.ignoreSubjects,
    emailSyncDays: Number(mail.syncDays) || 365,
  });

  const persistEmail = async () => {
    const response = await fetch("/api/integrations/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(emailPayload()),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось сохранить почту");
    setIntegration(data);
    setMail((current) => ({ ...current, password: "" }));
    return data as IntegrationState;
  };

  const saveEmail = async () => {
    setBusy("email-save");
    try {
      await persistEmail();
      toast.success("Почта сохранена");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения почты");
    } finally {
      setBusy(null);
    }
  };

  const testEmail = async () => {
    setBusy("email-test");
    try {
      await persistEmail();
      const response = await fetch("/api/integrations/email/test", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Подключение не прошло проверку");
      setHealth(v=>({...v,email:"ok"})); toast.success("IMAP и SMTP работают — почта подключена");
      await loadIntegration();
    } catch (error) {
      setHealth(v=>({...v,email:"error"})); toast.error(error instanceof Error ? error.message : "Ошибка подключения почты");
    } finally {
      setBusy(null);
    }
  };

  const syncEmail = async () => {
    setBusy("email-sync");
    try {
      const response = await fetch("/api/integrations/email/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось синхронизировать почту");
      toast.success(data.imported ? `Загружено новых писем: ${data.imported}` : "Почта синхронизирована");
      await loadIntegration();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка синхронизации");
    } finally {
      setBusy(null);
    }
  };

  const autoMail = () => {
    const preset = mailPreset(mail.address);
    setMail((current) => ({
      ...current,
      ...preset,
      username: current.username || current.address,
    }));
    toast.success("Серверы подставлены — проверь и сохрани");
  };

  const saveOpenAi = async () => {
    setBusy("openai-save");
    try {
      const response = await fetch("/api/integrations/openai", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({apiKey:openAiKey,model:openAi.model,baseUrl:openAi.baseUrl}) });
      const data = await response.json(); if(!response.ok) throw new Error(data.error || "Не удалось сохранить OpenAI");
      setOpenAi(data); setOpenAiKey(""); toast.success("OpenAI подключён");
    } catch(error){ toast.error(error instanceof Error ? error.message : "Ошибка OpenAI"); } finally { setBusy(null); }
  };
  const loadOpenAiModels = async () => {
    setBusy("openai-models");
    try {
      const response=await fetch("/api/integrations/openai?models=1",{cache:"no-store"});
      const data=await response.json();
      setOpenAiModels(Array.isArray(data.models)?data.models:[]);
      setOpenAiModelsError(data.modelsError||"");
      if(data.models?.length) toast.success(`Доступно моделей: ${data.models.length}`);
      else toast.error(data.modelsError||"API не вернул список моделей");
    } catch(error){toast.error(error instanceof Error?error.message:"Не удалось получить модели");}
    finally{setBusy(null);}
  };

  const testOpenAi = async () => {
    setBusy("openai-test");
    try {
      const response=await fetch("/api/integrations/openai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"test"})});
      const data=await response.json(); if(!response.ok) throw new Error(data.error || "Проверка не пройдена");
      setOpenAi(data); setHealth(v=>({...v,ai:"ok"})); toast.success("OpenAI работает — AI-менеджер подключён");
    } catch(error){setHealth(v=>({...v,ai:"error"})); toast.error(error instanceof Error?error.message:"Ошибка OpenAI");} finally{setBusy(null);}
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
        <Card className="overflow-hidden">
          <CardHeader className="cursor-pointer" onClick={()=>toggleSection("pipeline")}><CardTitle className="text-base flex items-center justify-between"><span className="flex items-center gap-2"><Kanban className="h-4 w-4"/>Этапы воронки</span><ChevronDown className={`h-4 w-4 transition-transform ${openSections.pipeline?"rotate-180":""}`}/></CardTitle></CardHeader>
          {openSections.pipeline && <CardContent>
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
          </CardContent>}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="cursor-pointer" onClick={()=>toggleSection("notifications")}>
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><Bell className="h-4 w-4" />
              Уведомления CRM</span><ChevronDown className={`h-4 w-4 transition-transform ${openSections.notifications?"rotate-180":""}`}/>
            </CardTitle>
          </CardHeader>
          {openSections.notifications && <CardContent className="space-y-3">
            <NotificationToggle />
            <p className="text-xs text-muted-foreground">
              Браузерные уведомления работают, пока CRM открыта. Telegram ниже будет получать новые лиды независимо от открытой вкладки.
            </p>
          </CardContent>}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="cursor-pointer" onClick={()=>toggleSection("telegram")}>
            <CardTitle className="text-base flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Telegram
              </span>
              <Badge variant={integration?.telegramConfigured ? "default" : "outline"}>
                {integration?.telegramConfigured ? (health.telegram==="error"?"Ошибка":"Подключён") : "Не настроен"}
              </Badge>
              <ChevronDown className={`h-4 w-4 transition-transform ${openSections.telegram?"rotate-180":""}`}/>
            </CardTitle>
          </CardHeader>
          {openSections.telegram && <CardContent className="space-y-4">
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
          </CardContent>}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="cursor-pointer" onClick={()=>toggleSection("need")}>
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><PhoneIncoming className="h-4 w-4" />
              Need Number</span><span className="flex items-center gap-2">{statusBadge("unknown",Boolean(integration?.needNumberWebhookPath))}<ChevronDown className={`h-4 w-4 transition-transform ${openSections.need?"rotate-180":""}`}/></span>
            </CardTitle>
          </CardHeader>
          {openSections.need && <CardContent className="space-y-4">
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
          </CardContent>}
        </Card>

        <Card className="xl:col-span-2 overflow-hidden">
          <CardHeader className="cursor-pointer" onClick={()=>toggleSection("ai")}>
            <CardTitle className="text-base flex items-center justify-between gap-3">
              <span className="flex items-center gap-2"><Bot className="h-4 w-4" /> ИИ-ассистент / OpenAI</span>
              <span className="flex items-center gap-2">{statusBadge(health.ai,openAi.configured)}<ChevronDown className={`h-4 w-4 transition-transform ${openSections.ai?"rotate-180":""}`}/></span>
            </CardTitle>
          </CardHeader>
          {openSections.ai && <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">Вставь API key один раз. Он сохраняется на сервере CRM в зашифрованном виде и после сохранения полностью больше не показывается.</div>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>OpenAI API key</Label>
                <Input type="password" autoComplete="new-password" placeholder={openAi.configured ? openAi.masked + " — вставь новый только для замены" : "sk-..."} value={openAiKey} onChange={e=>setOpenAiKey(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Модель AI-менеджера</Label>
                {openAiModels.length ? (
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={openAi.model} onChange={e=>setOpenAi(v=>({...v,model:e.target.value}))}>
                    {!openAiModels.includes(openAi.model) && <option value={openAi.model}>{openAi.model} — недоступна</option>}
                    {openAiModels.map(model=><option key={model} value={model}>{model}</option>)}
                  </select>
                ) : <Input value={openAi.model} onChange={e=>setOpenAi(v=>({...v,model:e.target.value}))} />}
                <Button type="button" variant="outline" size="sm" onClick={loadOpenAiModels} disabled={busy!==null}>
                  {busy==="openai-models" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Получить доступные модели
                </Button>
                {openAiModelsError && <p className="text-[11px] text-destructive">{openAiModelsError}</p>}
              </div>
              <div className="space-y-2">
                <Label>Base URL</Label>
                <Input placeholder="https://api.openai.com/v1" value={openAi.baseUrl} onChange={e=>setOpenAi(v=>({...v,baseUrl:e.target.value}))} />
                <p className="text-[11px] text-muted-foreground">Для стороннего API вставь адрес из инструкции продавца, обязательно с /v1.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveOpenAi} disabled={busy!==null || (!openAiKey && !openAi.configured)}>
                {busy==="openai-save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {openAi.configured ? "Сохранить / заменить" : "Подключить"}
              </Button>
              <Button variant="outline" onClick={testOpenAi} disabled={busy!==null || !openAi.configured}>
                {busy==="openai-test" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />} Проверить соединение
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Ключ используется сервером для разбора переписок, КП и документов. В браузер сохранённый ключ не возвращается.</p>
          </CardContent>}
        </Card>

        <Card className="xl:col-span-2 overflow-hidden">
          <CardHeader className="cursor-pointer" onClick={()=>toggleSection("email")}>
            <CardTitle className="text-base flex items-center justify-between gap-3">
              <span className="flex items-center gap-2"><Mail className="h-4 w-4" /> Почта → CRM-чат</span>
              <Badge variant={integration?.emailConfigured ? "default" : "outline"}>
                {integration?.emailConfigured ? (health.email==="error"?"Ошибка":"Подключена") : "Не настроена"}
              </Badge><ChevronDown className={`h-4 w-4 transition-transform ${openSections.email?"rotate-180":""}`}/>
            </CardTitle>
          </CardHeader>
          {openSections.email && <CardContent className="space-y-5">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              Входящие письма от людей попадают в раздел <b>«Почта»</b> и автоматически связываются с клиентом по email. No-reply, рассылки, автоответы и заданные ниже отправители уходят в отдельную вкладку <b>«Сервисные»</b>. Отвечать можно прямо из CRM — как в обычном чате.
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Email</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="hello@satori.ru"
                    value={mail.address}
                    onChange={(event) => setMail((current) => ({ ...current, address: event.target.value }))}
                  />
                  <Button type="button" variant="outline" onClick={autoMail} title="Подставить IMAP/SMTP по домену">
                    <WandSparkles className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Имя отправителя</Label>
                <Input value={mail.fromName} onChange={(event) => setMail((current) => ({ ...current, fromName: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Логин</Label>
                <Input placeholder="Обычно совпадает с email" value={mail.username} onChange={(event) => setMail((current) => ({ ...current, username: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Пароль / пароль приложения</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder={integration?.emailPasswordConfigured ? "Пароль сохранён — оставь пустым, чтобы не менять" : "Пароль приложения"}
                  value={mail.password}
                  onChange={(event) => setMail((current) => ({ ...current, password: event.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">Пароль хранится только на сервере CRM и никогда не возвращается в браузер.</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-4 space-y-3">
                <div className="font-medium text-sm">Входящие — IMAP</div>
                <div className="grid grid-cols-[1fr_110px] gap-2">
                  <Input placeholder="imap.example.com" value={mail.imapHost} onChange={(event) => setMail((current) => ({ ...current, imapHost: event.target.value }))} />
                  <Input inputMode="numeric" value={mail.imapPort} onChange={(event) => setMail((current) => ({ ...current, imapPort: event.target.value }))} />
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mail.imapSecure} onChange={(event) => setMail((current) => ({ ...current, imapSecure: event.target.checked }))} /> SSL/TLS</label>
              </div>
              <div className="rounded-lg border p-4 space-y-3">
                <div className="font-medium text-sm">Исходящие — SMTP</div>
                <div className="grid grid-cols-[1fr_110px] gap-2">
                  <Input placeholder="smtp.example.com" value={mail.smtpHost} onChange={(event) => setMail((current) => ({ ...current, smtpHost: event.target.value }))} />
                  <Input inputMode="numeric" value={mail.smtpPort} onChange={(event) => setMail((current) => ({ ...current, smtpPort: event.target.value }))} />
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mail.smtpSecure} onChange={(event) => setMail((current) => ({ ...current, smtpSecure: event.target.checked }))} /> SSL/TLS сразу (обычно порт 465)</label>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>История, дней</Label>
                <Input inputMode="numeric" value={mail.syncDays} onChange={(event) => setMail((current) => ({ ...current, syncDays: event.target.value }))} />
                <p className="text-[11px] text-muted-foreground">По умолчанию подтягиваем год истории из Входящих и Отправленных.</p>
              </div>
              <div className="space-y-2">
                <Label>Сервисные отправители</Label>
                <Input placeholder="noreply@..., @service.ru" value={mail.ignoreSenders} onChange={(event) => setMail((current) => ({ ...current, ignoreSenders: event.target.value }))} />
                <p className="text-[11px] text-muted-foreground">Через запятую. Они не создают клиентов.</p>
              </div>
              <div className="space-y-2">
                <Label>Сервисные слова в теме</Label>
                <Input placeholder="код подтверждения, security alert" value={mail.ignoreSubjects} onChange={(event) => setMail((current) => ({ ...current, ignoreSubjects: event.target.value }))} />
                <p className="text-[11px] text-muted-foreground">Через запятую. Письма останутся доступными в «Сервисных».</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={saveEmail} disabled={busy !== null || !mail.address || !mail.imapHost || !mail.smtpHost}>
                {busy === "email-save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Сохранить почту
              </Button>
              <Button variant="outline" onClick={testEmail} disabled={busy !== null || !mail.address || !mail.imapHost || !mail.smtpHost}>
                {busy === "email-test" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Проверить IMAP + SMTP
              </Button>
              <Button variant="outline" onClick={syncEmail} disabled={busy !== null || !integration?.emailConfigured}>
                {busy === "email-sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Синхронизировать сейчас
              </Button>
            </div>

            <div className="rounded-lg border p-3 text-xs text-muted-foreground">
              <div><b>Последняя синхронизация:</b> {lastSyncText(integration?.emailLastSyncAt || "")}</div>
              {integration?.emailLastSyncError && <div className="mt-1 text-red-600"><b>Последняя ошибка:</b> {integration.emailLastSyncError}</div>}
              <div className="mt-2">После подключения сервер проверяет почту автоматически каждую минуту. Ручная кнопка нужна только если хочешь увидеть письмо сразу.</div>
            </div>
          </CardContent>}
        </Card>
      </div>
    </div>
  );
}
