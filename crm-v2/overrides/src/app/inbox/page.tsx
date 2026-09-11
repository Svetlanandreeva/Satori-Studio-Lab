"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Send,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface EmailThread {
  id: string;
  subject: string;
  remoteEmail: string;
  remoteName: string | null;
  contactId: string | null;
  isService: boolean;
  unreadCount: number;
  lastMessageAt: string;
  lastSnippet: string | null;
  lastDirection: string;
}

interface EmailMessage {
  id: string;
  direction: "incoming" | "outgoing";
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  bodyText: string;
  receivedAt: string;
}

interface ThreadDetail {
  thread: EmailThread;
  messages: EmailMessage[];
  contact: { id: string; name: string; company: string | null; email: string | null } | null;
}

type Filter = "client" | "service" | "all";

function formatDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat("ru-RU", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
  ).format(date);
}

export default function InboxPage() {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [filter, setFilter] = useState<Filter>("client");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");

  const loadThreads = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/inbox?filter=${filter}&search=${encodeURIComponent(search)}`,
        { cache: "no-store" }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось загрузить почту");
      const next = (payload.threads || []) as EmailThread[];
      setThreads(next);
      const wanted = preferredId || selectedId;
      const nextId = wanted && next.some((item) => item.id === wanted) ? wanted : next[0]?.id || null;
      setSelectedId(nextId);
      if (!nextId) setDetail(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка загрузки почты");
    } finally {
      setLoading(false);
    }
  }, [filter, search, selectedId]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/inbox/${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось открыть диалог");
      setDetail(payload as ThreadDetail);
      setThreads((current) => current.map((thread) => thread.id === id ? { ...thread, unreadCount: 0 } : thread));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка диалога");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => loadThreads(), 180);
    return () => window.clearTimeout(timer);
  }, [filter, search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const sync = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/integrations/email/sync", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось синхронизировать почту");
      if (payload.configured === false) {
        toast.error("Сначала подключи почту в Настройках");
      } else {
        toast.success(payload.imported ? `Добавлено писем: ${payload.imported}` : "Почта синхронизирована");
      }
      await loadThreads(selectedId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка синхронизации");
    } finally {
      setSyncing(false);
    }
  };

  const send = async () => {
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    try {
      const response = await fetch(`/api/inbox/${encodeURIComponent(selectedId)}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: draft }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось отправить письмо");
      setDraft("");
      await loadDetail(selectedId);
      await loadThreads(selectedId);
      toast.success("Отправлено");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка отправки");
    } finally {
      setSending(false);
    }
  };

  const classify = async (isService: boolean) => {
    if (!selectedId) return;
    try {
      const response = await fetch(`/api/inbox/${encodeURIComponent(selectedId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isService }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось изменить тип переписки");
      toast.success(isService ? "Перенесено в сервисные" : "Помечено как запрос клиента");
      await loadThreads();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка классификации");
    }
  };

  const title = detail?.contact?.name || detail?.thread.remoteName || detail?.thread.remoteEmail || "Диалог";
  const filters = useMemo(() => [
    { value: "client" as const, label: "Запросы" },
    { value: "service" as const, label: "Сервисные" },
    { value: "all" as const, label: "Все" },
  ], []);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="h-6 w-6" />
            <h1 className="text-2xl font-bold tracking-tight">Почта</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Реальные запросы клиентов — как чат. Автоматические письма и уведомления отделены в «Сервисные».
          </p>
        </div>
        <Button variant="outline" onClick={sync} disabled={syncing}>
          {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Синхронизировать
        </Button>
      </div>

      <div className="grid min-h-[68vh] grid-cols-1 overflow-hidden rounded-xl border bg-background xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border-b xl:border-b-0 xl:border-r">
          <div className="space-y-3 border-b p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Имя, email или тема..."
                className="pl-9"
              />
            </div>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {filters.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setFilter(item.value)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${filter === item.value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[62vh] overflow-y-auto xl:max-h-[calc(100vh-280px)]">
            {loading && threads.length === 0 ? (
              <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка...
              </div>
            ) : threads.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Mail className="mx-auto mb-2 h-8 w-8 opacity-40" />
                Здесь пока нет писем.
              </div>
            ) : (
              threads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => setSelectedId(thread.id)}
                  className={`w-full border-b p-4 text-left transition hover:bg-muted/50 ${selectedId === thread.id ? "bg-muted" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 rounded-full p-2 ${thread.isService ? "bg-slate-100" : "bg-blue-50"}`}>
                      {thread.isService ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-semibold">
                          {thread.remoteName || thread.remoteEmail}
                        </div>
                        {thread.unreadCount > 0 && (
                          <Badge className="ml-auto h-5 min-w-5 justify-center px-1.5 text-[10px]">{thread.unreadCount}</Badge>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{thread.subject}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {thread.lastDirection === "outgoing" ? "Вы: " : ""}{thread.lastSnippet || "—"}
                      </div>
                      <div className="mt-2 text-[10px] text-muted-foreground">{formatDate(thread.lastMessageAt)}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex min-h-[520px] flex-col">
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
              <div><Mail className="mx-auto mb-3 h-10 w-10 opacity-30" />Выбери диалог слева</div>
            </div>
          ) : detailLoading && !detail ? (
            <div className="flex flex-1 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : detail ? (
            <>
              <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-semibold">{title}</h2>
                    <Badge variant={detail.thread.isService ? "secondary" : "default"}>
                      {detail.thread.isService ? "Сервисное" : "Клиент"}
                    </Badge>
                  </div>
                  <div className="mt-0.5 truncate text-sm text-muted-foreground">{detail.thread.remoteEmail}</div>
                  <div className="truncate text-xs text-muted-foreground">{detail.thread.subject}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {detail.contact && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/contacts/${detail.contact.id}`}>Открыть клиента</Link>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => classify(!detail.thread.isService)}
                  >
                    {detail.thread.isService ? "Это запрос клиента" : "В сервисные"}
                  </Button>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4 xl:max-h-[calc(100vh-390px)]">
                {detail.messages.map((message) => {
                  const outgoing = message.direction === "outgoing";
                  return (
                    <div key={message.id} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
                      <Card className={`max-w-[88%] p-0 shadow-sm sm:max-w-[75%] ${outgoing ? "bg-blue-600 text-white" : "bg-background"}`}>
                        <div className="px-4 py-3">
                          <div className={`mb-2 flex gap-3 text-[10px] ${outgoing ? "text-blue-100" : "text-muted-foreground"}`}>
                            <span>{outgoing ? "Вы" : message.fromName || message.fromEmail}</span>
                            <span>{formatDate(message.receivedAt)}</span>
                          </div>
                          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.bodyText || "(пустое письмо)"}</div>
                        </div>
                      </Card>
                    </div>
                  );
                })}
              </div>

              <div className="border-t p-3">
                <div className="flex gap-2">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") send();
                    }}
                    rows={3}
                    placeholder="Ответить клиенту..."
                    className="min-h-[76px] flex-1 resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <Button className="h-auto px-4" onClick={send} disabled={sending || !draft.trim()}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">⌘/Ctrl + Enter — отправить. Ответ уходит с подключённой почты.</div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
