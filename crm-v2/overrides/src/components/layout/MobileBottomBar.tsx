"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, LayoutDashboard, MessageCircle, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Сегодня", icon: LayoutDashboard },
  { href: "/inbox", label: "Сообщения", icon: MessageCircle },
  { href: "/projects", label: "Проекты", icon: FolderKanban },
  { href: "/contacts", label: "Клиенты", icon: Users },
  { href: "/assistant", label: "Помощник", icon: Sparkles },
];

export function MobileBottomBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 px-1 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl md:hidden">
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className={cn("flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[9px] font-medium transition-colors", active ? "text-slate-950" : "text-slate-400")}>
              <div className={cn("flex h-7 w-10 items-center justify-center rounded-full", active && "bg-slate-950 text-white")}>
                <item.icon className="h-[17px] w-[17px]" />
              </div>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
