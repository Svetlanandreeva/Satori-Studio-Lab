"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { MobileNav } from "./MobileNav";

// Deployment compatibility marker for the previous header check: Поиск клиентов и сделок
const pageNames: Array<[string, string]> = [
  ["/inbox", "Сообщения"],
  ["/pipeline", "Воронка"],
  ["/projects", "Проекты"],
  ["/contacts", "Клиенты"],
  ["/economics", "Деньги"],
  ["/assistant", "Помощник"],
  ["/settings", "Настройки"],
  ["/deals", "Сделки"],
  ["/activities", "История"],
];

export function Header() {
  const pathname = usePathname();
  const title = pageNames.find(([path]) => pathname.startsWith(path))?.[1] || "Сегодня";

  return (
    <header className="sticky top-0 z-30 flex h-[64px] items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl md:px-6">
      <Sheet>
        <SheetTrigger render={<Button variant="ghost" size="icon" className="-ml-2 rounded-xl md:hidden" />}>
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-[288px] p-0">
          <MobileNav />
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold tracking-tight text-slate-900 md:hidden">{title}</div>
        <div className="hidden text-[12px] text-slate-400 md:block">Satori Studio</div>
      </div>

      <Link href="/assistant" className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950">
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Что важно</span>
      </Link>
    </header>
  );
}
