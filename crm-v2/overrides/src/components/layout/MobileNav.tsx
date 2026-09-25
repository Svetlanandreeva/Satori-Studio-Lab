"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Banknote, Boxes, CalendarClock, Factory, FolderKanban, Handshake, LayoutDashboard, MessageCircle, Settings, ShieldCheck, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

type Item={href:string;label:string;icon:typeof LayoutDashboard};
const primary:Item[]=[
 {href:"/",label:"Главная",icon:LayoutDashboard},{href:"/deals",label:"Сделки",icon:Handshake},{href:"/contacts",label:"Клиенты",icon:Users},{href:"/inbox",label:"Сообщения",icon:MessageCircle},{href:"/tasks",label:"Задачи",icon:CalendarClock},
];
const secondary:Item[]=[
 {href:"/projects",label:"Проекты",icon:FolderKanban},{href:"/production",label:"Производство",icon:Factory},{href:"/economics",label:"Деньги",icon:Banknote},{href:"/procurement",label:"Закупки",icon:Boxes},{href:"/analytics",label:"Аналитика",icon:BarChart3},{href:"/assistant",label:"AI помощник",icon:Sparkles},{href:"/control",label:"Контроль",icon:ShieldCheck},{href:"/settings",label:"Настройки",icon:Settings},
];
export function MobileNav(){
 const pathname=usePathname();
 const render=(item:Item)=>{const active=pathname===item.href||(item.href!=="/"&&pathname.startsWith(item.href));return <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition",active?"bg-white/10 text-white":"text-white/55 hover:bg-white/[.06] hover:text-white")}><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[.05]"><item.icon className="h-4 w-4"/></span>{item.label}</Link>};
 return <div className="flex h-full flex-col bg-[#15171c] text-white"><div className="flex h-[76px] items-center justify-between border-b border-white/[.06] px-5"><div className="flex items-center gap-3"><div className="studio-gradient flex h-10 w-10 items-center justify-center rounded-2xl text-xs font-bold">S</div><div><div className="text-[15px] font-semibold">Satori Studio</div><div className="mt-0.5 text-[10px] uppercase tracking-[.15em] text-white/35">CRM workspace</div></div></div><ThemeToggle/></div><nav className="flex-1 overflow-y-auto px-3 py-4"><div className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[.2em] text-white/25">Работа</div><div className="space-y-1">{primary.map(render)}</div><div className="my-5 h-px bg-white/[.06]"/><div className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[.2em] text-white/25">Управление</div><div className="space-y-1">{secondary.map(render)}</div></nav></div>
}
