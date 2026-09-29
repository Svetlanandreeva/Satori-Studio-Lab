"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadMessages } from "@/lib/use-unread-messages";
import { ThemeToggle } from "./ThemeToggle";
import { OWNER_ONLY, PRIMARY_NAV, SECONDARY_NAV, isActive, type NavItem } from "./nav-items";
import { useMe } from "./use-role";

function NavLink({ item, pathname, badge = 0 }: { item: NavItem; pathname: string; badge?: number }) {
  const active = isActive(pathname, item.href);
  return (
    <Link href={item.href} title={item.hint} className={cn(
      "flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors",
      active ? "bg-white/[.12] text-white" : "text-white/60 hover:bg-white/[.06] hover:text-white",
    )}>
      <item.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-white" : "text-white/45")} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {badge > 0 && <span className="rounded-full bg-[#8b7cff] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{badge > 99 ? "99+" : badge}</span>}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { summary } = useUnreadMessages();
  const me = useMe();
  const owner = me?.role === "owner";
  const earnings = SECONDARY_NAV.find((i) => i.href === "/earnings");
  const primary = me && !owner && earnings ? [...PRIMARY_NAV, earnings] : PRIMARY_NAV;
  const secondary = SECONDARY_NAV.filter((i) => (owner || !OWNER_ONLY.includes(i.href)) && !(me && !owner && i.href === "/earnings"));
  const secondaryActive = secondary.some((item) => isActive(pathname, item.href));
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    try { setMoreOpen(localStorage.getItem("satori-nav-more") === "1"); } catch {}
  }, []);
  const toggleMore = () => {
    setMoreOpen((v) => { try { localStorage.setItem("satori-nav-more", v ? "0" : "1"); } catch {} return !v; });
  };
  const showMore = moreOpen || secondaryActive;

  return (
    <aside className="sticky top-0 hidden h-dvh w-[220px] shrink-0 flex-col border-r border-white/[.06] bg-[#15171c] text-white md:flex">
      <div className="flex h-[60px] shrink-0 items-center justify-between px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <div className="studio-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white">S</div>
          <div className="truncate text-[15px] font-semibold tracking-tight">Satori CRM</div>
        </Link>
        <ThemeToggle />
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4 pt-2">
        {primary.map((item) => <NavLink key={item.href} item={item} pathname={pathname} badge={item.href === "/inbox" ? summary.all : 0} />)}

        <button onClick={toggleMore} className="mt-4 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.14em] text-white/35 hover:text-white/70">
          <span className="flex-1 text-left">Ещё</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showMore ? "rotate-180" : "")} />
        </button>
        {showMore && <div className="space-y-0.5">{secondary.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}</div>}
      </nav>

      <div className="shrink-0 border-t border-white/[.06] p-2.5">
        {owner && <NavLink item={{ href: "/settings", label: "Настройки", icon: Settings }} pathname={pathname} />}
        {me && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-white/45">
            <span className="min-w-0 flex-1 truncate">{me.name}{owner ? "" : " · менеджер"}</span>
            <button type="button" onClick={() => { void fetch("/api/auth/logout", { method: "POST" }).finally(() => { window.location.href = "/login"; }); }} className="rounded px-1.5 py-0.5 hover:bg-white/[.08] hover:text-white">Выйти</button>
          </div>
        )}
      </div>
    </aside>
  );
}
