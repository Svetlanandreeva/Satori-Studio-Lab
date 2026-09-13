"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Banknote,
  Boxes,
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
import { useUnreadMessages } from "@/lib/use-unread-messages";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  iconBg: string;
  iconText: string;
  dot: string;
};

const workItems: NavItem[] = [
  { href: "/", label: "Сегодня", icon: LayoutDashboard, iconBg: "bg-blue-50", iconText: "text-blue-600", dot: "bg-blue-500" },
  { href: "/inbox", label: "Сообщения", icon: MessageCircle, iconBg: "bg-sky-50", iconText: "text-sky-600", dot: "bg-sky-500" },
  { href: "/tasks", label: "Задачи", icon: CalendarClock, iconBg: "bg-blue-50", iconText: "text-blue-700", dot: "bg-blue-600" },
  { href: "/pipeline", label: "Воронка", icon: Kanban, iconBg: "bg-violet-50", iconText: "text-violet-600", dot: "bg-violet-500" },
  { href: "/projects", label: "Проекты", icon: FolderKanban, iconBg: "bg-amber-50", iconText: "text-amber-600", dot: "bg-amber-500" },
  { href: "/production", label: "Производство", icon: Factory, iconBg: "bg-orange-50", iconText: "text-orange-600", dot: "bg-orange-500" },
  { href: "/contacts", label: "Клиенты", icon: Users, iconBg: "bg-teal-50", iconText: "text-teal-600", dot: "bg-teal-500" },
];

const managementItems: NavItem[] = [
  { href: "/economics", label: "Деньги", icon: Banknote, iconBg: "bg-emerald-50", iconText: "text-emerald-600", dot: "bg-emerald-500" },
  { href: "/procurement", label: "Закупки", icon: Boxes, iconBg: "bg-lime-50", iconText: "text-lime-700", dot: "bg-lime-500" },
  { href: "/analytics", label: "Аналитика", icon: BarChart3, iconBg: "bg-fuchsia-50", iconText: "text-fuchsia-600", dot: "bg-fuchsia-500" },
  { href: "/assistant", label: "Помощник", icon: Sparkles, iconBg: "bg-indigo-50", iconText: "text-indigo-600", dot: "bg-indigo-500" },
  { href: "/control", label: "Контроль", icon: ShieldCheck, iconBg: "bg-slate-100", iconText: "text-slate-700", dot: "bg-slate-600" },
];

const settingsItem: NavItem = {
  href: "/settings",
  label: "Настройки",
  icon: Settings,
  iconBg: "bg-slate-100",
  iconText: "text-slate-600",
  dot: "bg-slate-500",
};

function unreadLabel(value: number) {
  return value > 99 ? "99+" : String(value);
}

function NavLink({ item, pathname, unreadCount = 0 }: { item: NavItem; pathname: string; unreadCount?: number }) {
  const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
  const showUnread = item.href === "/inbox" && unreadCount > 0;
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-2xl px-2.5 py-2 text-[14px] font-medium transition-all",
        isActive
          ? "bg-white text-slate-950 shadow-[0_2px_10px_rgba(15,23,42,.06)] ring-1 ring-slate-200/80"
          : "text-slate-600 hover:bg-white/80 hover:text-slate-950"
      )}
    >
      <span className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-[1.03]", item.iconBg, item.iconText)}>
        <item.icon className="h-[17px] w-[17px]" />
        {showUnread && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-white" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {showUnread ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm">
          {unreadLabel(unreadCount)}
        </span>
      ) : (
        <span className={cn("h-1.5 w-1.5 rounded-full transition-opacity", item.dot, isActive ? "opacity-100" : "opacity-0")} />
      )}
    </Link>
  );
}

function NavGroup({ title, items, pathname, unreadCount = 0 }: { title: string; items: NavItem[]; pathname: string; unreadCount?: number }) {
  return (
    <section>
      <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">{title}</div>
      <div className="space-y-1 rounded-[22px] border border-slate-200/70 bg-slate-50/70 p-1.5">
        {items.map((item) => <NavLink key={item.href} item={item} pathname={pathname} unreadCount={item.href === "/inbox" ? unreadCount : 0} />)}
      </div>
    </section>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { summary } = useUnreadMessages();

  return (
    <aside className="sticky top-0 hidden h-dvh min-h-0 w-[248px] shrink-0 flex-col overflow-hidden border-r border-slate-200/80 bg-[#fbfbfc] md:flex">
      <div className="flex h-[76px] shrink-0 items-center px-5">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-[11px] font-semibold tracking-[.14em] text-white shadow-sm">S</div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight text-slate-950">Satori CRM</div>
            <div className="mt-0.5 text-[11px] text-slate-400">рабочее пространство</div>
          </div>
        </Link>
      </div>

      <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-3 pb-5">
        <NavGroup title="Работа" items={workItems} pathname={pathname} unreadCount={summary.all} />
        <NavGroup title="Управление" items={managementItems} pathname={pathname} />
      </nav>

      <div className="shrink-0 border-t border-slate-200/70 bg-[#fbfbfc] p-3">
        <div className="rounded-[22px] border border-slate-200/70 bg-white/70 p-1.5">
          <NavLink item={settingsItem} pathname={pathname} />
        </div>
        <p className="px-3 pt-3 text-[10px] leading-4 text-slate-400">Satori Studio · CRM</p>
      </div>
    </aside>
  );
}
