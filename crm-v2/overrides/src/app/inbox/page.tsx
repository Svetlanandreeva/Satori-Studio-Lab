"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Inbox, Loader2, MoreHorizontal, RefreshCw, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { InboxStatus } from "@/components/inbox/InboxStatus";
import { Composer, type Template } from "@/components/inbox/Composer";
import { Avatar, ThreadRow, clock, dayTitle, timeOf, toDate, unreadLabel, type Channel, type UnifiedThread } from "@/components/inbox/InboxParts";
import { DocumentChip, DocumentPreview } from "@/components/documents/DocumentPreview";
import { emitUnreadMessagesChanged, useUnreadMessages } from "@/lib/use-unread-messages";

type Filter = "all" | "telegram" | "email" | "contractors" | "service";
interface UnifiedMessage { id: string; direction: "incoming" | "outgoing"; bodyText: string; receivedAt: string; sender?: string | null; sourceMessageId?: string | null; }
interface UnifiedDocument { id: string; name: string; mimeType?: string | null; sizeBytes: number; createdAt: number; sourceMessageId: string | null; kind: string; }
interface UnifiedDetail { channel: Channel; threadId: string; contactId: string | null; title: string; subtitle: string; isService: boolean; messages: UnifiedMessage[]; documents: UnifiedDocument[]; }

const FILTERS: Array<{ value: Filter; label: string }> = [{ value: "all", label: "Все" }, { value: "telegram", label: "Telegram" }, { value: "email", label: "Почта" }, { value: "contractors", label: "Подрядчики" }, { value: "service", label: "Сервис" }];
const PLACEHOLDER = /^(🖼 Фото|📎 Документ)/;
function threadFromLocation() { return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("thread"); }

export default function InboxPage() {
  const [threads, setThreads] = useState<UnifiedThread[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<UnifiedDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<UnifiedDocument | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  const [mobileChat, setMobileChat] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { summary: unread } = useUnreadMessages();
  const endRef = useRef<HTMLDivElement | null>(null);

  const unreadFor = (v: Filter) => (v === "telegram" ? unread.telegram : v === "email" ? unread.email : v === "service" ? unread.service : v === "contractors" ? 0 : unread.all);

  async function loadTemplates() {
    try { const r = await fetch("/api/templates", { cache: "no-store" }); const d = await r.json(); if (r.ok) setTemplates(d.templates || []); } catch {}
  }

  async function loadThreads(preferredKey?: string | null) {
    setLoading(true);
    try {
      const query = encodeURIComponent(search);
      const tasks: Array<Promise<UnifiedThread[]>> = [];
      const groups = await fetch("/api/inbox/status?list=groups", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
      const contractorIds = new Set<string>(groups.contractors || []);
      const archivedAt: Record<string, number> = groups.archived || {};
      const isArchived = (t: UnifiedThread) => Boolean(t.contactId && archivedAt[t.contactId] && timeOf(t.lastMessageAt) <= archivedAt[t.contactId] + 60_000);
      if (filter !== "telegram") {
        tasks.push(fetch(`/api/inbox?filter=${filter === "service" ? "service" : "client"}&search=${query}`, { cache: "no-store" }).then(async (r) => {
          const p = await r.json(); if (!r.ok) throw new Error(p.error || "Не удалось загрузить почту");
          return (p.threads || []).map((t: any): UnifiedThread => ({ key: `email:${t.id}`, id: t.id, channel: "email", contactId: t.contactId || null, title: t.remoteName || t.remoteEmail, subtitle: t.subject || t.remoteEmail, isService: Boolean(t.isService), unreadCount: Number(t.unreadCount || 0), lastMessageAt: t.lastMessageAt, lastSnippet: t.lastSnippet || null, lastDirection: t.lastDirection || "incoming" }));
        }));
      }
      if (filter === "all" || filter === "telegram" || filter === "contractors") {
        tasks.push(fetch(`/api/messages/telegram?search=${query}`, { cache: "no-store" }).then(async (r) => {
          const p = await r.json(); if (!r.ok) throw new Error(p.error || "Не удалось загрузить Telegram");
          return (p.threads || []).map((t: any): UnifiedThread => ({ key: `telegram:${t.id}`, id: t.id, channel: "telegram", contactId: t.contactId || t.id, title: t.remoteName || "Telegram", subtitle: t.remoteHandle || "", isService: false, unreadCount: Number(t.unreadCount || 0), lastMessageAt: t.lastMessageAt, lastSnippet: t.lastSnippet || null, lastDirection: t.lastDirection || "incoming", telegramKind: t.channel }));
        }));
      }
      const all = (await Promise.all(tasks)).flat()
        .filter((t) => filter === "service" ? true : filter === "contractors" ? Boolean(t.contactId && contractorIds.has(t.contactId)) : !(t.contactId && contractorIds.has(t.contactId)));
      // Отказы и «Не клиент» прячем, пока клиент не напишет снова (после отказа).
      const archivable = filter !== "service" && filter !== "contractors";
      const list = all.filter((t) => !archivable || (showArchived ? isArchived(t) : !isArchived(t)))
        .sort((a, b) => (Number(b.unreadCount > 0) - Number(a.unreadCount > 0)) || timeOf(b.lastMessageAt) - timeOf(a.lastMessageAt));
      setThreads(list);
      setArchivedCount(archivable ? all.filter(isArchived).length : 0);
      const wanted = preferredKey || selectedKey || threadFromLocation();
      const nextKey = wanted && list.some((t) => t.key === wanted) ? wanted : list[0]?.key || null;
      setSelectedKey(nextKey); if (!nextKey) setDetail(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка загрузки сообщений"); }
    finally { setLoading(false); }
  }

  async function loadDetail(key: string) {
    setDetailLoading(true);
    try {
      const [channel, id] = key.split(":", 2) as [Channel, string];
      if (channel === "telegram") {
        const r = await fetch(`/api/messages/telegram/${encodeURIComponent(id)}`, { cache: "no-store" }); const p = await r.json(); if (!r.ok) throw new Error(p.error || "Не удалось открыть Telegram-диалог");
        setDetail({ channel, threadId: id, contactId: p.contact?.id || id, title: p.contact?.name || p.thread?.remoteName || "Telegram", subtitle: [p.thread?.remoteHandle, p.thread?.channel === "telegram_account" ? "личный Telegram" : "Telegram-бот"].filter(Boolean).join(" · "), isService: false, documents: p.documents || [], messages: (p.messages || []).map((m: any) => ({ id: m.id, direction: m.direction, bodyText: m.bodyText || "", receivedAt: m.receivedAt, sender: null, sourceMessageId: m.sourceMessageId || null })) });
      } else {
        const r = await fetch(`/api/inbox/${encodeURIComponent(id)}`, { cache: "no-store" }); const p = await r.json(); if (!r.ok) throw new Error(p.error || "Не удалось открыть письмо");
        setDetail({ channel, threadId: id, contactId: p.contact?.id || p.thread?.contactId || null, title: p.contact?.name || p.thread?.remoteName || p.thread?.remoteEmail || "Почта", subtitle: [(p.addresses?.length ? p.addresses : [p.thread?.remoteEmail]).filter(Boolean).join(", "), p.thread?.subject].filter(Boolean).join(" · "), isService: Boolean(p.thread?.isService), documents: p.documents || [], messages: (p.messages || []).map((m: any) => ({ id: m.id, direction: m.direction, bodyText: m.bodyText || "", receivedAt: m.receivedAt, sender: m.direction === "outgoing" ? null : m.fromName || m.fromEmail, sourceMessageId: m.sourceMessageId || null })) });
      }
      setThreads((cur) => cur.map((t) => (t.key === key ? { ...t, unreadCount: 0 } : t))); emitUnreadMessagesChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка диалога"); }
    finally { setDetailLoading(false); }
  }

  useEffect(() => { void loadTemplates(); if (threadFromLocation()) setMobileChat(true); }, []);
  useEffect(() => { const t = window.setTimeout(() => void loadThreads(threadFromLocation()), 180); return () => window.clearTimeout(t); }, [filter, search, showArchived]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setMoreOpen(false); if (selectedKey) void loadDetail(selectedKey); else setDetail(null); }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (detail && !detailLoading) requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" })); }, [detail?.threadId, detail?.messages.length, detailLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sync() {
    setSyncing(true);
    try { const r = await fetch("/api/integrations/email/sync", { method: "POST" }); const p = await r.json(); if (!r.ok) throw new Error(p.error || "Не удалось синхронизировать почту"); toast.success(p.configured === false ? "Почта ещё не подключена" : p.imported ? `Новых писем: ${p.imported}` : "Всё свежее"); await loadThreads(selectedKey); if (selectedKey) await loadDetail(selectedKey); emitUnreadMessagesChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка синхронизации"); }
    finally { setSyncing(false); }
  }

  async function send(text: string, file: File | null) {
    if (!detail) return false;
    setSending(true);
    try {
      let r: Response;
      if (file) {
        const form = new FormData(); form.set("file", file);
        if (detail.channel === "telegram") { form.set("contactId", detail.contactId || ""); form.set("text", text); r = await fetch("/api/integrations/telegram/reply", { method: "POST", body: form }); }
        else { form.set("message", text); r = await fetch(`/api/inbox/${encodeURIComponent(detail.threadId)}/reply`, { method: "POST", body: form }); }
      } else {
        r = detail.channel === "telegram"
          ? await fetch("/api/integrations/telegram/reply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contactId: detail.contactId, text }) })
          : await fetch(`/api/inbox/${encodeURIComponent(detail.threadId)}/reply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }) });
      }
      const p = await r.json(); if (!r.ok) throw new Error(p.error || "Не удалось отправить");
      if (selectedKey) await loadDetail(selectedKey); void loadThreads(selectedKey);
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка отправки"); return false; }
    finally { setSending(false); }
  }

  async function toggleService() {
    if (!detail || detail.channel !== "email") return;
    setMoreOpen(false);
    try { const r = await fetch(`/api/inbox/${encodeURIComponent(detail.threadId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isService: !detail.isService }) }); const p = await r.json(); if (!r.ok) throw new Error(p.error || "Не удалось изменить тип переписки"); toast.success(detail.isService ? "Перенесено в обычные" : "Перенесено в сервисные"); await loadThreads(null); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка"); }
  }

  // Сообщения с разделителями по дням и вложениями под своим сообщением.
  const body = useMemo(() => {
    if (!detail) return null;
    const docsFor = (m: UnifiedMessage) => detail.documents.filter((d) => d.sourceMessageId && m.sourceMessageId && d.sourceMessageId === m.sourceMessageId);
    const attachments = (docs: UnifiedDocument[], out: boolean) => <div className={`flex flex-col gap-1.5 ${out ? "items-end" : "items-start"}`}>{docs.map((d) => <DocumentChip key={d.id} doc={d} onOpen={() => setPreviewDoc(d)} contactId={detail.contactId} />)}</div>;
    const orphans = detail.documents.filter((d) => !detail.messages.some((m) => m.sourceMessageId && m.sourceMessageId === d.sourceMessageId));
    let lastDay = "";
    return (
      <div className="mx-auto max-w-[860px] space-y-1.5">
        {detail.messages.map((m, i) => {
          const out = m.direction === "outgoing";
          const docs = docsFor(m);
          const text = docs.length && PLACEHOLDER.test(m.bodyText) ? "" : m.bodyText;
          const day = toDate(m.receivedAt).toDateString();
          const showDay = day !== lastDay; lastDay = day;
          const prev = detail.messages[i - 1];
          const grouped = !showDay && prev && prev.direction === m.direction && (prev.sender || "") === (m.sender || "");
          return (
            <Fragment key={m.id}>
              {showDay && <div className="sticky top-0 z-10 flex justify-center py-2"><span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm backdrop-blur dark:bg-[#1c1f25]/90">{dayTitle(m.receivedAt)}</span></div>}
              <div className={`flex ${out ? "justify-end" : "justify-start"} ${grouped ? "" : "pt-1.5"}`}>
                <div className={`max-w-[85%] sm:max-w-[70%] ${out ? "items-end" : "items-start"} flex flex-col gap-1`}>
                  {!out && m.sender && !grouped && <span className="px-1 text-[11px] text-slate-400">{m.sender}</span>}
                  {docs.length > 0 && detail.channel === "telegram" && attachments(docs, out)}
                  {(text || !docs.length) && (
                    <div className={`rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed shadow-sm ${out ? "rounded-br-md bg-slate-900 text-white dark:bg-violet-600" : "rounded-bl-md border border-slate-200/80 bg-white text-slate-800 dark:border-white/[.08] dark:bg-[#1c1f25] dark:text-slate-100"}`}>
                      <span className="whitespace-pre-wrap break-words">{text || "(пустое сообщение)"}</span>
                      <span className={`float-right ml-3 mt-1.5 text-[10.5px] leading-none ${out ? "text-white/55" : "text-slate-400"}`}>{clock(m.receivedAt)}</span>
                    </div>
                  )}
                  {docs.length > 0 && detail.channel === "email" && attachments(docs, out)}
                  {!(text || !docs.length) && <span className="px-1 text-[10.5px] text-slate-400">{clock(m.receivedAt)}</span>}
                </div>
              </div>
            </Fragment>
          );
        })}
        {orphans.length > 0 && (
          <div className="mt-4 rounded-xl border border-dashed bg-white/70 p-3 dark:bg-white/[.03]">
            <div className="mb-2 text-[12px] font-medium text-slate-500">Вложения из переписки</div>
            <div className="flex flex-wrap gap-2">{orphans.map((d) => <DocumentChip key={d.id} doc={d} onOpen={() => setPreviewDoc(d)} contactId={detail.contactId} />)}</div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    );
  }, [detail]);

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[560px] flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Сообщения</h1>
        {unread.all > 0 && <span className="rounded-full bg-sky-500 px-2 py-0.5 text-[12px] font-semibold text-white">{unreadLabel(unread.all)}</span>}
        <button onClick={() => void sync()} disabled={syncing} className="ml-auto flex h-9 items-center gap-2 rounded-xl border bg-white px-3 text-[13px] font-medium hover:bg-slate-50 disabled:opacity-60 dark:bg-[#16181d]">{syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}<span className="hidden sm:inline">Проверить почту</span></button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm md:grid-cols-[370px_minmax(0,1fr)] dark:border-white/[.08] dark:bg-[#16181d]">
        {/* Список диалогов */}
        <aside className={`${mobileChat ? "hidden md:flex" : "flex"} min-h-0 flex-col border-slate-200/80 md:border-r dark:border-white/[.08]`}>
          <div className="space-y-2.5 p-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по имени, почте, нику" className="h-9 w-full rounded-xl border-0 bg-slate-100 pl-9 pr-3 text-[13px] outline-none focus:ring-2 focus:ring-slate-300 dark:bg-white/[.06]" /></div>
            <div className="-mx-1 flex gap-0.5 overflow-x-auto px-1 [scrollbar-width:none]">
              {FILTERS.map((f) => { const n = unreadFor(f.value); return (
                <button key={f.value} type="button" onClick={() => { setFilter(f.value); setShowArchived(false); }} className={`flex h-7 shrink-0 items-center gap-1 rounded-full px-[9px] text-[12px] font-medium transition ${filter === f.value ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[.06]"}`}>
                  {f.label}{n > 0 && <span className={`rounded-full px-1.5 text-[10px] font-bold ${filter === f.value ? "bg-white/20" : "bg-sky-500 text-white"}`}>{unreadLabel(n)}</span>}
                </button>); })}
            </div>
          </div>
          {showArchived && <div className="flex items-center gap-2 border-y bg-amber-50/60 px-3 py-2 text-[12px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"><button onClick={() => setShowArchived(false)} className="flex items-center gap-1 font-medium hover:underline"><ArrowLeft className="h-3.5 w-3.5" />Назад</button><span>Отказы и «не клиенты»</span></div>}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && !threads.length ? <div className="flex justify-center p-8 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Загрузка…</div>
              : !threads.length ? <div className="p-10 text-center text-sm text-slate-500"><Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />{search ? "Ничего не нашлось." : "Здесь пока пусто."}</div>
              : threads.map((t) => <ThreadRow key={t.key} thread={t} active={selectedKey === t.key} onOpen={() => { setSelectedKey(t.key); setMobileChat(true); }} />)}
          </div>
          {!showArchived && archivedCount > 0 && <button type="button" onClick={() => setShowArchived(true)} className="flex items-center justify-between border-t px-4 py-2.5 text-left text-[12px] text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[.03]"><span>Скрыты отказы и «не клиенты»</span><span className="font-medium text-slate-800 dark:text-slate-200">{archivedCount} →</span></button>}
        </aside>

        {/* Диалог */}
        <section className={`${mobileChat ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-col overflow-hidden`}>
          {!selectedKey ? <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-slate-400"><Inbox className="h-8 w-8 opacity-40" />Выбери диалог слева</div>
            : detailLoading && !detail ? <div className="flex flex-1 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            : detail ? <>
              <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200/80 px-4 py-3 dark:border-white/[.08]">
                <button type="button" onClick={() => setMobileChat(false)} className="-ml-1 rounded-lg p-1 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Все чаты"><ArrowLeft className="h-5 w-5" /></button>
                <Avatar name={detail.title} channel={detail.channel} service={detail.isService} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{detail.title}</div>
                  <div className="truncate text-[12px] text-slate-500">{detail.subtitle}</div>
                </div>
                  <div className="relative sm:order-last">
                    <button type="button" onClick={() => setMoreOpen((v) => !v)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[.06]" aria-label="Ещё"><MoreHorizontal className="h-5 w-5" /></button>
                    {moreOpen && (
                      <div className="absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border bg-white p-1.5 shadow-xl dark:bg-[#1c1f25]" onMouseLeave={() => setMoreOpen(false)}>
                        {detail.contactId && <Link href={`/contacts/${detail.contactId}`} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] hover:bg-slate-100 dark:hover:bg-white/[.06]"><UserRound className="h-4 w-4 text-slate-500" />Карточка клиента</Link>}
                        {detail.channel === "email" && <button type="button" onClick={() => void toggleService()} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-slate-100 dark:hover:bg-white/[.06]"><Inbox className="h-4 w-4 text-slate-500" />{detail.isService ? "Это не сервисное письмо" : "Это сервисное письмо"}</button>}
                      </div>
                    )}
                </div>
                <div className="order-last flex w-full items-center gap-2 overflow-x-auto sm:order-none sm:w-auto">
                  {!detail.isService && <InboxStatus channel={detail.channel} threadId={detail.channel === "email" ? detail.threadId : null} contactId={detail.contactId || null} title={detail.title} onChanged={() => { void loadThreads(selectedKey); if (selectedKey) void loadDetail(selectedKey); }} />}
                </div>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto bg-[#f4f5f8] px-3 pb-4 sm:px-5 dark:bg-black/20">{body}</div>
              {!detail.isService && <Composer key={detail.threadId} channel={detail.channel} contactId={detail.contactId} clientName={detail.title} templates={templates} sending={sending} onSend={send} onTemplatesChanged={() => void loadTemplates()} />}
            </> : null}
        </section>
      </div>
      {detail?.contactId && <DocumentPreview contactId={detail.contactId} doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </div>
  );
}
