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

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; badge?: string };

const workItems: NavItem[] = [
  { href: "/", label: "Сегодня", icon: LayoutDashboard },
  { href: "/inbox", label: "Сообщения", icon: MessageCircle },
  { href: "/pipeline", label: "Воронка", icon: Kanban },
  { href: "/projects", label: "Проекты", icon: FolderKanban },
  { href: "/contacts", label: "Клиенты", icon: Users },
];

const managementItems: NavItem[] = [
  { href: "/economics", label: "Деньги", icon: Banknote },
  { href: "/assistant", label: "Помощник", icon: Sparkles },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-all",
        isActive
          ? "bg-slate-950 text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
      )}
    >
      <item.icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-white" : "text-slate-400 group-hover:text-slate-700")} />
      <span>{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden min-h-screen w-[232px] shrink-0 flex-col border-r border-slate-200/80 bg-white md:flex">
      <div className="flex h-[72px] items-center px-5">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-[10px] font-semibold tracking-[.12em] text-white">S</div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight text-slate-950">Satori</div>
            <div className="text-[11px] text-slate-400">рабочее пространство</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 pb-5">
        <div className="space-y-1">
          {workItems.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
        </div>

        <div className="mb-2 mt-7 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Управление</div>
        <div className="space-y-1">
          {managementItems.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
        </div>
      </nav>

      <div className="border-t border-slate-100 p-3">
        <NavLink item={{ href: "/settings", label: "Настройки", icon: Settings }} pathname={pathname} />
        <p className="px-3 pt-3 text-[10px] leading-4 text-slate-400">Satori Studio · CRM</p>
      </div>
    </aside>
  );
}
