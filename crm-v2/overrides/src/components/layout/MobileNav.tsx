"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  FolderKanban,
  Kanban,
  LayoutDashboard,
  MessageCircle,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const primary = [
  { href: "/", label: "Сегодня", icon: LayoutDashboard },
  { href: "/inbox", label: "Сообщения", icon: MessageCircle },
  { href: "/pipeline", label: "Воронка", icon: Kanban },
  { href: "/projects", label: "Проекты", icon: FolderKanban },
  { href: "/contacts", label: "Клиенты", icon: Users },
];

const secondary = [
  { href: "/economics", label: "Деньги", icon: Banknote },
  { href: "/assistant", label: "Помощник", icon: Sparkles },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const render = (item: typeof primary[number]) => {
    const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-medium transition-colors",
          active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
        )}
      >
        <item.icon className={cn("h-5 w-5", active ? "text-white" : "text-slate-400")} />
        {item.label}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col bg-white text-slate-950">
      <div className="flex h-[72px] items-center gap-3 border-b border-slate-100 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-[10px] font-semibold tracking-[.12em] text-white">S</div>
        <div>
          <div className="text-[15px] font-semibold">Satori</div>
          <div className="text-[11px] text-slate-400">рабочее пространство</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {primary.map(render)}
        <div className="px-4 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Управление</div>
        {secondary.map(render)}
      </nav>
    </div>
  );
}
