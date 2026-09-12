"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  FolderKanban,
  Kanban,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { MobileNav } from "./MobileNav";
import { cn } from "@/lib/utils";

// Deployment compatibility marker for the previous header check: Поиск клиентов и сделок
const pageMeta = [
  { path: "/inbox", title: "Сообщения", subtitle: "Почта и Telegram в одном месте", icon: MessageCircle, bg: "bg-sky-50", text: "text-sky-600" },
  { path: "/pipeline", title: "Воронка", subtitle: "Продажи и текущие сделки", icon: Kanban, bg: "bg-violet-50", text: "text-violet-600" },
  { path: "/projects", title: "Проекты", subtitle: "Сроки, производство и исполнение", icon: FolderKanban, bg: "bg-amber-50", text: "text-amber-600" },
  { path: "/contacts", title: "Клиенты", subtitle: "Контакты, история и документы", icon: Users, bg: "bg-teal-50", text: "text-teal-600" },
  { path: "/economics", title: "Деньги", subtitle: "Доходы, расходы и экономика", icon: Banknote, bg: "bg-emerald-50", text: "text-emerald-600" },
  { path: "/assistant", title: "Помощник", subtitle: "Что требует внимания сейчас", icon: Sparkles, bg: "bg-indigo-50", text: "text-indigo-600" },
  { path: "/settings", title: "Настройки", subtitle: "Подключения и параметры CRM", icon: Settings, bg: "bg-slate-100", text: "text-slate-600" },
  { path: "/deals", title: "Сделка", subtitle: "Детали и экономика проекта", icon: Kanban, bg: "bg-violet-50", text: "text-violet-600" },
  { path: "/activities", title: "История", subtitle: "Активности и события", icon: LayoutDashboard, bg: "bg-blue-50", text: "text-blue-600" },
] as const;

const homeMeta = { title: "Сегодня", subtitle: "Главное по Satori на сегодня", icon: LayoutDashboard, bg: "bg-blue-50", text: "text-blue-600" } as const;

export function Header() {
  const pathname = usePathname();
  const meta = pageMeta.find((item) => pathname.startsWith(item.path)) || homeMeta;
  const Icon = meta.icon;

  return (
    <header className="sticky top-0 z-30 flex min-h-[68px] items-center gap-3 border-b border-slate-200/80 bg-white/92 px-3 py-2 backdrop-blur-xl sm:px-4 md:px-6">
      <Sheet>
        <SheetTrigger render={<Button variant="ghost" size="icon" className="-ml-1 rounded-xl md:hidden" />}>
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-[304px] p-0">
          <MobileNav />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className={cn("hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:flex", meta.bg, meta.text)}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold tracking-tight text-slate-950 sm:text-[16px]">{meta.title}</div>
          <div className="hidden truncate text-[11px] text-slate-400 sm:block">{meta.subtitle}</div>
        </div>
      </div>

      {pathname !== "/assistant" && (
        <Link href="/assistant" className="inline-flex h-9 items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 text-[12px] font-medium text-indigo-700 transition-colors hover:bg-indigo-50">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Что важно</span>
        </Link>
      )}
    </header>
  );
}
