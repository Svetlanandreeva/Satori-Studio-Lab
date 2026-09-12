"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, LayoutDashboard, MessageCircle, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadMessages } from "@/lib/use-unread-messages";

const items = [
  { href: "/", label: "Сегодня", icon: LayoutDashboard, activeBg: "bg-blue-50", activeText: "text-blue-600" },
  { href: "/inbox", label: "Сообщения", icon: MessageCircle, activeBg: "bg-sky-50", activeText: "text-sky-600" },
  { href: "/projects", label: "Проекты", icon: FolderKanban, activeBg: "bg-amber-50", activeText: "text-amber-600" },
  { href: "/contacts", label: "Клиенты", icon: Users, activeBg: "bg-teal-50", activeText: "text-teal-600" },
  { href: "/assistant", label: "Помощник", icon: Sparkles, activeBg: "bg-indigo-50", activeText: "text-indigo-600" },
];

function unreadLabel(value: number) {
  return value > 99 ? "99+" : String(value);
}

export function MobileBottomBar() {
  const pathname = usePathname();
  const { summary } = useUnreadMessages();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/96 px-1 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl md:hidden">
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const unreadCount = item.href === "/inbox" ? summary.all : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[9px] font-medium transition-colors", active ? item.activeText : "text-slate-400")}
            >
              <div className={cn("relative flex h-8 w-11 items-center justify-center rounded-2xl transition-all", active ? `${item.activeBg} ${item.activeText}` : "bg-transparent")}>
                <item.icon className="h-[18px] w-[18px]" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-sky-500 px-1 py-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-white">
                    {unreadLabel(unreadCount)}
                  </span>
                )}
              </div>
              <span className={cn("truncate", active && "font-semibold")}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
