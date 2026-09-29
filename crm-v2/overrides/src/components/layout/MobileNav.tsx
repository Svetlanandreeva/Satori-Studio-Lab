"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { OWNER_ONLY, PRIMARY_NAV, SECONDARY_NAV, isActive, type NavItem } from "./nav-items";
import { useMe } from "./use-role";

export function MobileNav() {
  const pathname = usePathname();
  const me = useMe();
  const owner = me?.role === "owner";
  const render = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    return <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/[.06] hover:text-white")}><item.icon className="h-[18px] w-[18px]" />{item.label}</Link>;
  };
  return (
    <div className="flex h-full flex-col bg-[#15171c] text-white">
      <div className="flex h-[60px] items-center justify-between border-b border-white/[.06] px-4"><div className="flex items-center gap-2.5"><div className="studio-gradient flex h-8 w-8 items-center justify-center rounded-xl text-[11px] font-bold">S</div><div className="text-[15px] font-semibold">Satori CRM</div></div><ThemeToggle /></div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
        {PRIMARY_NAV.map(render)}
        <div className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[.14em] text-white/35">Ещё</div>
        {SECONDARY_NAV.filter((i) => owner || !OWNER_ONLY.includes(i.href)).map(render)}
        {owner && render({ href: "/settings", label: "Настройки", icon: Settings })}
      </nav>
      {me && <div className="flex items-center gap-2 border-t border-white/[.06] px-5 py-3 text-[13px] text-white/50"><span className="min-w-0 flex-1 truncate">{me.name}{owner ? "" : " · менеджер"}</span><button type="button" onClick={() => { void fetch("/api/auth/logout", { method: "POST" }).finally(() => { window.location.href = "/login"; }); }} className="rounded px-2 py-1 hover:bg-white/[.08] hover:text-white">Выйти</button></div>}
    </div>
  );
}
