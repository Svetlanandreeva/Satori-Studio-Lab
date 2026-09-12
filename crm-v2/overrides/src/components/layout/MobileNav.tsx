"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Banknote,
  CalendarClock,
  Factory,
  FolderKanban,
  Kanban,
  LayoutDashboard,
  MessageCircle,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  iconBg: string;
  iconText: string;
};

const primary: Item[] = [
  { href: "/", label: "Сегодня", icon: LayoutDashboard, iconBg: "bg-blue-50", iconText: "text-blue-600" },
  { href: "/inbox", label: "Сообщения", icon: MessageCircle, iconBg: "bg-sky-50", iconText: "text-sky-600" },
  { href: "/tasks", label: "Задачи", icon: CalendarClock, iconBg: "bg-blue-50", iconText: "text-blue-700" },
  { href: "/pipeline", label: "Воронка", icon: Kanban, iconBg: "bg-violet-50", iconText: "text-violet-600" },
  { href: "/projects", label: "Проекты", icon: FolderKanban, iconBg: "bg-amber-50", iconText: "text-amber-600" },
  { href: "/production", label: "Производство", icon: Factory, iconBg: "bg-orange-50", iconText: "text-orange-600" },
  { href: "/contacts", label: "Клиенты", icon: Users, iconBg: "bg-teal-50", iconText: "text-teal-600" },
];

const secondary: Item[] = [
  { href: "/economics", label: "Деньги", icon: Banknote, iconBg: "bg-emerald-50", iconText: "text-emerald-600" },
  { href: "/analytics", label: "Аналитика", icon: BarChart3, iconBg: "bg-fuchsia-50", iconText: "text-fuchsia-600" },
  { href: "/assistant", label: "Помощник", icon: Sparkles, iconBg: "bg-indigo-50", iconText: "text-indigo-600" },
  { href: "/control", label: "Контроль", icon: ShieldCheck, iconBg: "bg-slate-100", iconText: "text-slate-700" },
  { href: "/settings", label: "Настройки", icon: Settings, iconBg: "bg-slate-100", iconText: "text-slate-600" },
];

export function MobileNav() {
  const pathname = usePathname();
  const render = (item: Item) => {
    const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-2xl px-2.5 py-2 text-[15px] font-medium transition-all",
          active ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200/80" : "text-slate-600"
        )}
      >
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", item.iconBg, item.iconText)}>
          <item.icon className="h-[19px] w-[19px]" />
        </span>
        {item.label}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col bg-[#fbfbfc] text-slate-950">
      <div className="flex h-[76px] items-center gap-3 border-b border-slate-200/70 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-[11px] font-semibold tracking-[.14em] text-white">S</div>
        <div>
          <div className="text-[15px] font-semibold">Satori CRM</div>
          <div className="mt-0.5 text-[11px] text-slate-400">рабочее пространство</div>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        <section>
          <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Работа</div>
          <div className="space-y-1 rounded-[22px] border border-slate-200/70 bg-slate-50/70 p-1.5">{primary.map(render)}</div>
        </section>
        <section>
          <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Управление</div>
          <div className="space-y-1 rounded-[22px] border border-slate-200/70 bg-slate-50/70 p-1.5">{secondary.map(render)}</div>
        </section>
      </nav>
    </div>
  );
}
