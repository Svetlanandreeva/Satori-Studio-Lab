"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bot, Loader2, Mail, MessageCircle, RefreshCw, Search, Send, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Channel = "email" | "telegram";
type Filter = "all" | "telegram" | "email" | "service";

interface UnifiedThread {
  key: string;
  id: string;
  channel: Channel;
  contactId: string | null;
  title: string;
  subtitle: string;
  isService: boolean;
  unreadCount: number;
  lastMessageAt: string;
  lastSnippet: string | null;
  lastDirection: string;
  telegramKind?: string;
}

interface UnifiedMessage {
  id: string;
  direction: "incoming" | "outgoing";
  bodyText: string;
  receivedAt: string;
  sender?: string | null;
}

interface UnifiedDetail {
  channel: Channel;
  threadId: string;
  contactId: string | null;
  title: string;
  subtitle: string;
  isService: boolean;
  pipelineStage: string | null;
  messages: UnifiedMessage[];
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat("ru-RU", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
  ).format(date);
}

const filters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "telegram", label: "Telegram" },
  { value: "email", label: "Почта" },
  { value: "service", label: "Сервисные" },
];

export default function InboxPage() {
  const [threads, setThreads] = useState<UnifiedThread[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<UnifiedDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [draft, setDraft] = useState("");

  async function loadThreads(preferredKey?: string | null) {
    setLoading(true);
    try {
      const query = encodeURIComponent(search);
      const tasks: Array<Promise<UnifiedThread[]>> = [];

      if (filter === "all" || filter === "email" || filter === "service") {
        const emailFilter = filter === "service" ? "service" : filter === "email" ? "client" : "all";
        tasks.push(fetch(`/api/inbox?filter=${emailFilter}&search=${query}`, { cache: "no-store" })
          .then(async (response) => {
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "Не удалось загрузить почту");
            return (payload.threads || []).map((thread: any): UnifiedThread => ({
              key: `email:${thread.id}`,
              id: thread.id,
              channel: "email",
              contactId: thread.contactId || null,
              title: thread.remoteName || thread.remoteEmail,
              subtitle: thread.subject || thread.remoteEmail,
              isService: Boolean(thread.isService),
              unreadCount: Number(thread.unreadCount || 0),
              lastMessageAt: thread.lastMessageAt,
              lastSnippet: thread.lastSnippet,
              lastDirection: thread.lastDirection,
            }));
          }));
      }

      if (filter === "all" || filter === "telegram") {
        tasks.push(fetch(`/api/messages/telegram?search=${query}`, { cache: "no-store" })
          .then(async (response) => {
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "Не удалось загрузить Telegram");
            return (payload.threads || []).map((thread: any): UnifiedThread => ({
              key: `telegram:${thread.id}`,
              id: thread.id,
              channel: "telegram",
              contactId: thread.contactId || thread.id,
              title: thread.remoteName || "Telegram",
              subtitle: thread.remoteHandle || (thread.channel === "telegram_account" ? "Личный Telegram" : "Telegram-бот"),
              isService: false,
              unreadCount: Number(thread.unreadCount || 0),
              lastMessageAt: thread.lastMessageAt,
              lastSnippet: thread.lastSnippet,
              lastDirection: thread.lastDirection,
              telegramKind: thread.channel,
            }));
          }));
      }

      const list = (await Promise.all(tasks)).flat()
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
      setThreads(list);
      const wanted = preferredKey || selectedKey;
      const nextKey = wanted && list.some((item) => item.key === wanted) ? wanted : list[0]?.key || null;
      setSelectedKey(nextKey);
      if (!nextKey) setDetail(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка загрузки сообщений");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(key: string) {
    setDetailLoading(true);
    try {
      const [channel, id] = key.split(":", 2) as [Channel, string];
      if (channel === "telegram") {
        const response = await fetch(`/api/messages/telegram/${encodeURIComponent(id)}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Не удалось открыть Telegram-диалог");
        setDetail({
          channel: "telegram",
          threadId: id,
          contactId: payload.contact?.id || id,
          title: payload.contact?.name || payload.thread?.remoteName || "Telegram",
          subtitle: payload.thread?.remoteHandle || (payload.thread?.channel === "telegram_account" ? "Личный Telegram" : "Telegram-бот"),
          isService: false,
          pipelineStage: null,
          messages: (payload.messages || []).map((message: any) => ({
            id: message.id,
            direction: message.direction,
            bodyText: message.bodyText || "",
            receivedAt: message.receivedAt,
            sender: message.direction === "outgoing" ? "Вы" : payload.contact?.name,
          })),
        });
      } else {
        const response = await fetch(`/api/inbox/${encodeURIComponent(id)}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Не удалось открыть письмо");
        setDetail({
          channel: "email",
          threadId: id,
          contactId: payload.contact?.id || payload.thread?.contactId || null,
          title: payload.contact?.name || payload.thread?.remoteName || payload.thread?.remoteEmail || "Почта",
          subtitle: [payload.thread?.remoteEmail, payload.thread?.subject].filter(Boolean).join(" · "),
          isService: Boolean(payload.thread?.isService),
          pipelineStage: payload.deal?.stageName || null,
          messages: (payload.messages || []).map((message: any) => ({
            id: message.id,
            direction: message.direction,
            bodyText: message.bodyText || "",
            receivedAt: message.receivedAt,
            sender: message.direction === "outgoing" ? "Вы" : message.fromName || message.fromEmail,
          })),
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка диалога");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadThreads(), 180);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search]);

  useEffect(() => {
    if (selectedKey) void loadDetail(selectedKey);
    else setDetail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const counts = useMemo(() => ({
    telegram: threads.filter((item) => item.channel === "telegram").length,
    email: threads.filter((item) => item.channel === "email" && !item.isService).length,
  }), [threads]);

  async function sync() {
    setSyncing(true);
    try {
      const response = await fetch("/api/integrations/email/sync", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось синхронизировать почту");
      toast.success(payload.configured === false ? "Почта ещё не подключена в Настройках" : payload.imported ? `Добавлено писем: ${payload.imported}` : "Сообщения обновлены");
      await loadThreads(selectedKey);
      if (selectedKey) await loadDetail(selectedKey);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка синхронизации");
    } finally {
      setSyncing(false);
    }
  }

  async function send() {
    if (!detail || !draft.trim()) return;
    setSending(true);
    try {
      const response = detail.channel === "telegram"
        ? await fetch("/api/integrations/telegram/reply", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ contactId: detail.contactId, text: draft }),
          })
        : await fetch(`/api/inbox/${encodeURIComponent(detail.threadId)}/reply`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: draft }),
          });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось отправить сообщение");
      setDraft("");
      if (selectedKey) await loadDetail(selectedKey);
      await loadThreads(selectedKey);
      toast.success("Отправлено");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка отправки");
    } finally {
      setSending(false);
    }
  }

  async function classify() {
    if (!detail || detail.channel !== "email") return;
    try {
      const response = await fetch(`/api/inbox/${encodeURIComponent(detail.threadId)}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ isService: !detail.isService }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось изменить тип переписки");
      await loadThreads(selectedKey);
      if (selectedKey) await loadDetail(selectedKey);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка классификации");
    }
  }

  async function promote() {
    if (!detail || detail.channel !== "email" || detail.contactId) return;
    setPromoting(true);
    try {
      const response = await fetch(`/api/inbox/${encodeURIComponent(detail.threadId)}/promote`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось добавить клиента в CRM");
      toast.success(`Клиент добавлен в CRM · воронка: ${payload.stageName || "Новый запрос"}`);
      await loadThreads(selectedKey);
      if (selectedKey) await loadDetail(selectedKey);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка добавления клиента");
    } finally {
      setPromoting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><MessageCircle className="h-6 w-6" /><h1 className="text-2xl font-bold tracking-tight">Сообщения</h1></div>
          <p className="mt-1 text-sm text-muted-foreground">Письма сами не создают клиентов. Нужный диалог добавляется в CRM вручную кнопкой «Добавить в CRM».</p>
        </div>
        <Button variant="outline" onClick={sync} disabled={syncing}>
          {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Обновить
        </Button>
      </div>

      <div className="grid min-h-[68vh] grid-cols-1 overflow-hidden rounded-xl border bg-background xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border-b xl:border-b-0 xl:border-r">
          <div className="space-y-3 border-b p-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Имя, email, Telegram..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
              {filters.map((item) => <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={`rounded-md px-1 py-1.5 text-[11px] font-medium ${filter === item.value ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{item.label}</button>)}
            </div>
          </div>
          <div className="max-h-[62vh] overflow-y-auto xl:max-h-[calc(100vh-280px)]">
            {loading && !threads.length ? <div className="flex justify-center p-8 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Загрузка...</div> : !threads.length ? <div className="p-8 text-center text-sm text-muted-foreground"><MessageCircle className="mx-auto mb-2 h-8 w-8 opacity-40" />Сообщений пока нет.</div> : threads.map((thread) => (
              <button key={thread.key} type="button" onClick={() => setSelectedKey(thread.key)} className={`w-full border-b p-4 text-left hover:bg-muted/50 ${selectedKey === thread.key ? "bg-muted" : ""}`}>
                <div className="flex gap-3">
                  <div className={`mt-0.5 rounded-full p-2 ${thread.channel === "telegram" ? "bg-sky-50" : thread.isService ? "bg-slate-100" : "bg-blue-50"}`}>
                    {thread.channel === "telegram" ? <MessageCircle className="h-4 w-4" /> : thread.isService ? <Bot className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{thread.title}</span>{thread.unreadCount > 0 && <Badge className="ml-auto h-5 px-1.5 text-[10px]">{thread.unreadCount}</Badge>}</div>
                    <div className="truncate text-xs text-muted-foreground">{thread.subtitle}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{thread.lastDirection === "outgoing" ? "Вы: " : ""}{thread.lastSnippet || "—"}</div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground"><span>{thread.channel === "telegram" ? (thread.telegramKind === "telegram_account" ? "Telegram аккаунт" : "Telegram-бот") : thread.isService ? "Сервисное письмо" : thread.contactId ? "Клиент CRM" : "Почта · не в CRM"}</span><span>{dateLabel(thread.lastMessageAt)}</span></div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-[520px] flex-col">
          {!selectedKey ? <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Выбери диалог слева</div> : detailLoading && !detail ? <div className="flex flex-1 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : detail ? <>
            <header className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold">{detail.title}</h2>
                  <Badge variant={detail.channel === "telegram" ? "default" : detail.isService ? "secondary" : "outline"}>{detail.channel === "telegram" ? "Telegram" : detail.isService ? "Сервисное" : "Почта"}</Badge>
                  {detail.pipelineStage && <Badge variant="outline">Воронка: {detail.pipelineStage}</Badge>}
                </div>
                <div className="truncate text-sm text-muted-foreground">{detail.subtitle}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {detail.contactId && <Link href={`/contacts/${detail.contactId}`} className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted">Открыть клиента</Link>}
                {detail.channel === "email" && !detail.contactId && <Button size="sm" onClick={promote} disabled={promoting}>{promoting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}Добавить в CRM</Button>}
                {detail.channel === "email" && <Button variant="outline" size="sm" onClick={classify}>{detail.isService ? "В обычные" : "В сервисные"}</Button>}
              </div>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4 xl:max-h-[calc(100vh-390px)]">
              {detail.messages.map((message) => {
                const outgoing = message.direction === "outgoing";
                return <div key={message.id} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl border px-4 py-3 shadow-sm sm:max-w-[75%] ${outgoing ? "border-blue-600 bg-blue-600 text-white" : "bg-background"}`}><div className={`mb-2 flex gap-3 text-[10px] ${outgoing ? "text-blue-100" : "text-muted-foreground"}`}><span>{outgoing ? "Вы" : message.sender || detail.title}</span><span>{dateLabel(message.receivedAt)}</span></div><div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.bodyText || "(пустое сообщение)"}</div></div></div>;
              })}
            </div>
            {!detail.isService && <footer className="border-t p-3"><div className="flex gap-2"><textarea rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void send(); }} placeholder={detail.channel === "telegram" ? "Ответить в Telegram..." : "Ответить по почте..."} className="min-h-[76px] flex-1 resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /><Button className="h-auto px-4" onClick={send} disabled={sending || !draft.trim()}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button></div><div className="mt-1 text-[10px] text-muted-foreground">⌘/Ctrl + Enter — отправить</div></footer>}
          </> : null}
        </section>
      </div>
      <div className="text-xs text-muted-foreground">В текущей выборке: Telegram — {counts.telegram}, почта — {counts.email}. Неизвестные отправители остаются только во входящих, пока вы сами не добавите их в CRM.</div>
    </div>
  );
}
