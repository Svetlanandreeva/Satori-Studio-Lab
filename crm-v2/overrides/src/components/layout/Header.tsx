"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { MobileNav } from "./MobileNav";
import { GlobalSearch } from "@/components/shared/GlobalSearch";
import { ThemeToggle } from "./ThemeToggle";

const meta=[
  ["/deals","Сделки","Заказы, суммы и статусы"],
  ["/contacts","Клиенты","База клиентов и вся история"],
  ["/inbox","Сообщения","Почта и Telegram"],
  ["/tasks","Задачи","Сегодня и follow-up"],
  ["/projects","Проекты","Исполнение и сроки"],
  ["/production","Производство","Текущие заказы"],
  ["/call-list","Обзвон","Лиды на обработку"],
  ["/economics","Деньги","Поступления и расходы"],
  ["/procurement","Закупки","Материалы и себестоимость"],
  ["/analytics","Аналитика","Продажи и источники"],
  ["/assistant","AI помощник","Срез по CRM"],
  ["/settings","Настройки","Интеграции и параметры"],
] as const;

export function Header(){
  const pathname=usePathname();
  const current=meta.find(([path])=>pathname.startsWith(path));
  const title=current?.[1]||"Главная";
  const subtitle=current?.[2]||"Satori Studio · рабочая панель";
  return <header className="sticky top-0 z-30 flex min-h-[68px] items-center gap-3 border-b border-black/[.05] bg-white/85 px-3 py-2 backdrop-blur-2xl dark:border-white/[.06] dark:bg-[#0f1115]/85 sm:px-4 md:px-6">
    <Sheet><SheetTrigger render={<Button variant="ghost" size="icon" className="-ml-1 rounded-xl md:hidden"/>}><Menu className="h-5 w-5"/></SheetTrigger><SheetContent side="left" className="w-[300px] border-white/[.08] bg-[#15171c] p-0"><MobileNav/></SheetContent></Sheet>
    <div className="hidden min-w-[190px] md:block"><div className="text-[14px] font-semibold tracking-tight text-slate-950 dark:text-white">{title}</div><div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">{subtitle}</div></div>
    <div className="min-w-0 flex-1"><GlobalSearch/></div>
    <div className="flex shrink-0 items-center gap-2 md:hidden"><ThemeToggle/></div>
    {pathname!=="/assistant"&&<Link href="/assistant" className="hidden h-9 items-center gap-2 rounded-xl border border-violet-200/70 bg-violet-50 px-3 text-[11px] font-semibold text-violet-700 transition hover:-translate-y-px dark:border-violet-400/15 dark:bg-violet-400/10 dark:text-violet-300 sm:inline-flex"><Sparkles className="h-3.5 w-3.5"/>AI срез</Link>}
  </header>
}
