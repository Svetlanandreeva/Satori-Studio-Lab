"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Banknote, Boxes, CalendarClock, Factory, FolderKanban, Handshake,
  LayoutDashboard, MessageCircle, PhoneCall, Settings, ShieldCheck, Sparkles, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadMessages } from "@/lib/use-unread-messages";
import { ThemeToggle } from "./ThemeToggle";

type Item = { href:string; label:string; icon:typeof LayoutDashboard; };

const primary:Item[] = [
  { href:"/", label:"Главная", icon:LayoutDashboard },
  { href:"/deals", label:"Сделки", icon:Handshake },
  { href:"/contacts", label:"Клиенты", icon:Users },
  { href:"/inbox", label:"Сообщения", icon:MessageCircle },
  { href:"/tasks", label:"Задачи", icon:CalendarClock },
];
const secondary:Item[] = [
  { href:"/projects", label:"Проекты", icon:FolderKanban },
  { href:"/production", label:"Производство", icon:Factory },
  { href:"/call-list", label:"Обзвон", icon:PhoneCall },
  { href:"/economics", label:"Деньги", icon:Banknote },
  { href:"/procurement", label:"Закупки", icon:Boxes },
  { href:"/analytics", label:"Аналитика", icon:BarChart3 },
  { href:"/assistant", label:"AI помощник", icon:Sparkles },
  { href:"/control", label:"Контроль", icon:ShieldCheck },
];

function NavLink({item,pathname,unread=0}:{item:Item;pathname:string;unread?:number}){
  const active=pathname===item.href||(item.href!=="/"&&pathname.startsWith(item.href));
  return <Link href={item.href} className={cn(
    "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-medium transition-all",
    active?"bg-white/[.10] text-white":"text-white/55 hover:bg-white/[.06] hover:text-white"
  )}>
    <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl border transition",active?"border-white/10 bg-white/10":"border-transparent bg-white/[.035] group-hover:border-white/[.06]")}><item.icon className="h-4 w-4"/></span>
    <span className="min-w-0 flex-1 truncate">{item.label}</span>
    {item.href==="/inbox"&&unread>0?<span className="rounded-full bg-[#8b7cff] px-2 py-0.5 text-[10px] font-semibold text-white">{unread>99?"99+":unread}</span>:active?<span className="h-1.5 w-1.5 rounded-full bg-[#9b8cff] shadow-[0_0_12px_#9b8cff]"/>:null}
  </Link>
}

export function Sidebar(){
  const pathname=usePathname();
  const {summary}=useUnreadMessages();
  return <aside className="sticky top-0 hidden h-dvh w-[242px] shrink-0 flex-col overflow-hidden border-r border-white/[.06] bg-[#15171c] text-white md:flex">
    <div className="flex h-[76px] shrink-0 items-center justify-between px-4">
      <Link href="/" className="flex min-w-0 items-center gap-3">
        <div className="studio-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xs font-bold text-white shadow-[0_10px_30px_rgba(133,102,255,.25)]">S</div>
        <div className="min-w-0"><div className="truncate text-[15px] font-semibold tracking-tight">Satori Studio</div><div className="mt-0.5 text-[10px] uppercase tracking-[.15em] text-white/35">CRM workspace</div></div>
      </Link>
      <ThemeToggle />
    </div>

    <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-3">
      <div className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[.2em] text-white/25">Работа</div>
      <div className="space-y-1">{primary.map(x=><NavLink key={x.href} item={x} pathname={pathname} unread={x.href==="/inbox"?summary.all:0}/>)}</div>
      <div className="my-5 h-px bg-white/[.06]"/>
      <div className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[.2em] text-white/25">Управление</div>
      <div className="space-y-1">{secondary.map(x=><NavLink key={x.href} item={x} pathname={pathname}/>)}</div>
    </nav>

    <div className="shrink-0 border-t border-white/[.06] p-3">
      <NavLink item={{href:"/settings",label:"Настройки",icon:Settings}} pathname={pathname}/>
      <div className="mt-3 flex items-center justify-between px-3 text-[9px] uppercase tracking-[.16em] text-white/20"><span>Satori CRM</span><span>2026</span></div>
    </div>
  </aside>
}
