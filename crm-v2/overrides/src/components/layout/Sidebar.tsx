"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArchiveX,
  Briefcase,
  Calculator,
  FolderKanban,
  Inbox,
  Kanban,
  LayoutDashboard,
  MessageCircle,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Главная", icon: LayoutDashboard },
  { href: "/pipeline", label: "Воронка", icon: Kanban },
  { href: "/projects", label: "Проекты", icon: FolderKanban },
  { href: "/contacts", label: "Клиенты", icon: Users },
  { href: "/deals", label: "Сделки", icon: Briefcase },
  { href: "/inbox", label: "Почта", icon: Inbox },
  { href: "/economics", label: "Экономика", icon: Calculator },
  { href: "/activities", label: "Активность", icon: Activity },
  { href: "/sandbox", label: "Песочница", icon: ArchiveX },
  { href: "/settings/telegram-business", label: "Telegram", icon: MessageCircle },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col bg-[var(--sidebar)] text-[var(--sidebar-foreground)] min-h-screen">
      <div className="flex h-16 items-center gap-2 px-6 border-b border-[var(--sidebar-border)]">
        <Briefcase className="h-6 w-6 text-[var(--sidebar-primary)]" />
        <span className="text-lg font-bold tracking-tight">SATORI CRM</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                isActive
                  ? "bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)]"
                  : "text-[var(--sidebar-foreground)]/70 hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]"
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-[var(--sidebar-border)]">
        <p className="text-xs text-[var(--sidebar-foreground)]/50">SATORI / CRM</p>
        <p className="text-xs text-[var(--sidebar-foreground)]/50">Satori Studio</p>
      </div>
    </aside>
  );
}
