"use client";

import { useEffect, useState } from "react";
import { Bot, Mail, Send } from "lucide-react";

export type Channel = "email" | "telegram";
export interface UnifiedThread { key: string; id: string; channel: Channel; contactId: string | null; title: string; subtitle: string; isService: boolean; unreadCount: number; lastMessageAt: string; lastSnippet: string | null; lastDirection: string; telegramKind?: string; }

const PALETTE = ["#7c3aed", "#2563eb", "#0891b2", "#059669", "#d97706", "#db2777", "#4f46e5", "#0d9488"];
function hash(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
export function initials(name: string) {
  const clean = name.replace(/[@<>"]/g, " ").replace(/[^\p{L}\p{N}\s.]/gu, "").trim();
  const parts = clean.split(/[\s.]+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

export function Avatar({ name, channel, service, size = 40, src }: { name: string; channel: Channel | null; service?: boolean; size?: number; src?: string | null }) {
  const Icon = service ? Bot : channel === "telegram" ? Send : Mail;
  const [photo, setPhoto] = useState<"loading" | "ok" | "none">(src ? "loading" : "none");
  useEffect(() => { setPhoto(src ? "loading" : "none"); }, [src]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="flex h-full w-full items-center justify-center rounded-full text-[13px] font-semibold text-white" style={{ background: service ? "#94a3b8" : PALETTE[hash(name) % PALETTE.length], fontSize: size * 0.34 }}>{initials(name)}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && photo !== "none" && <img src={src} alt="" loading="lazy" onLoad={() => setPhoto("ok")} onError={() => setPhoto("none")} className={`absolute inset-0 h-full w-full rounded-full object-cover transition-opacity ${photo === "ok" ? "opacity-100" : "opacity-0"}`} />}
      {channel && <span className={`absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white text-white dark:border-[#16181d] ${service ? "bg-slate-400" : channel === "telegram" ? "bg-sky-500" : "bg-blue-600"}`}><Icon className="h-2.5 w-2.5" /></span>}
    </div>
  );
}

/** Старые записи хранили миллисекунды в поле секунд — такие даты уезжают в 58-тысячный год. */
export function toDate(value: string | number | Date) {
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && d.getFullYear() > 3000 ? new Date(d.getTime() / 1000) : d;
}
export const timeOf = (value: string) => toDate(value).getTime() || 0;

export function shortTime(value: string) {
  const d = toDate(value); if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(d);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "вчера";
  return new Intl.DateTimeFormat("ru-RU", d.getFullYear() === now.getFullYear() ? { day: "numeric", month: "short" } : { day: "2-digit", month: "2-digit", year: "2-digit" }).format(d);
}
export function clock(value: string) { const d = toDate(value); return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(d); }
export function dayTitle(value: string) {
  const d = toDate(value); const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Сегодня";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", d.getFullYear() === now.getFullYear() ? { day: "numeric", month: "long", weekday: "short" } : { day: "numeric", month: "long", year: "numeric" }).format(d);
}
export const unreadLabel = (n: number) => (n > 99 ? "99+" : String(n));

export function ThreadRow({ thread, active, onOpen }: { thread: UnifiedThread; active: boolean; onOpen: () => void }) {
  const unread = thread.unreadCount > 0;
  return (
    <button type="button" onClick={onOpen} className={`relative flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${active ? "bg-slate-100 dark:bg-white/[.07]" : "hover:bg-slate-50 dark:hover:bg-white/[.03]"}`}>
      {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-slate-900 dark:bg-white" />}
      <Avatar name={thread.title} channel={thread.channel} service={thread.isService} src={thread.channel === "telegram" && thread.contactId ? `/api/contacts/${thread.contactId}/avatar` : null} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`min-w-0 flex-1 truncate text-[14px] ${unread ? "font-semibold text-slate-950 dark:text-white" : "font-medium"}`}>{thread.title}</span>
          <span className={`shrink-0 text-[11px] ${unread ? "font-medium text-sky-600" : "text-slate-400"}`}>{shortTime(thread.lastMessageAt)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[12.5px] ${unread ? "text-slate-700 dark:text-slate-200" : "text-slate-500"}`}>
            {thread.channel === "email" && thread.subtitle ? <span className="text-slate-400">{thread.subtitle}{thread.lastSnippet ? " · " : ""}</span> : null}
            {thread.lastSnippet ? <>{thread.lastDirection === "outgoing" ? <span className="text-slate-400">Вы: </span> : null}{thread.lastSnippet}</> : thread.channel === "email" && thread.subtitle ? null : "—"}
          </span>
          {unread && <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sky-500 px-1.5 text-[10px] font-bold text-white">{unreadLabel(thread.unreadCount)}</span>}
        </div>
      </div>
    </button>
  );
}
