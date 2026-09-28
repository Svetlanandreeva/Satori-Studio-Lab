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
  return <Link href={item.href} title={item.label} className={cn(
    "group/item flex h-11 items-center rounded-xl px-2 text-[13px] font-medium transition-all",
    active?"bg-white/[.10] text-white":"text-white/55 hover:bg-white/[.06] hover:text-white"
  )}>
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition",active?"bg-white/[.08]":"group-hover/item:bg-white/[.04]")}><item.icon className="h-4 w-4"/></span>
    <span className="ml-2 min-w-0 flex-1 truncate opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100">{item.label}</span>
    {item.href==="/inbox"&&unread>0?<span className="ml-2 rounded-full bg-[#8b7cff] px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover/sidebar:opacity-100">{unread>99?"99+":unread}</span>:null}
  </Link>
}

export function Sidebar(){
  const pathname=usePathname();
  const {summary}=useUnreadMessages();
  return <aside className="group/sidebar sticky top-0 z-40 hidden h-dvh w-[68px] shrink-0 flex-col overflow-hidden border-r border-white/[.045] bg-[#15171c] text-white transition-[width] duration-200 ease-out hover:w-[238px] md:flex">
    <div className="flex h-[68px] shrink-0 items-center px-3">
      <Link href="/" className="flex min-w-0 items-center">
        <div className="studio-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white">S</div>
        <div className="ml-3 min-w-0 whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100"><div className="text-[14px] font-semibold tracking-tight">Satori Studio</div><div className="mt-0.5 text-[9px] uppercase tracking-[.14em] text-white/30">CRM</div></div>
      </Link>
      <div className="ml-auto hidden group-hover/sidebar:block"><ThemeToggle /></div>
    </div>

    <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4 pt-2">
      <div className="mb-1 h-4 px-2 text-[9px] font-semibold uppercase tracking-[.18em] text-white/20 opacity-0 transition-opacity group-hover/sidebar:opacity-100">Работа</div>
      <div className="space-y-1">{primary.map(x=><NavLink key={x.href} item={x} pathname={pathname} unread={x.href==="/inbox"?summary.all:0}/>)}</div>
      <div className="my-3 h-px bg-white/[.05]"/>
      <div className="mb-1 h-4 px-2 text-[9px] font-semibold uppercase tracking-[.18em] text-white/20 opacity-0 transition-opacity group-hover/sidebar:opacity-100">Управление</div>
      <div className="space-y-1">{secondary.map(x=><NavLink key={x.href} item={x} pathname={pathname}/>)}</div>
    </nav>

    <div className="shrink-0 border-t border-white/[.05] p-2">
      <NavLink item={{href:"/settings",label:"Настройки",icon:Settings}} pathname={pathname}/>
    </div>
  </aside>
}
