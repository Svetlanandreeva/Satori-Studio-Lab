"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { MobileNav } from "./MobileNav";
import { GlobalSearch } from "@/components/shared/GlobalSearch";
import { QuickCreate } from "./QuickCreate";

export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-[60px] shrink-0 items-center gap-3 border-b border-black/[.05] bg-white/90 px-3 backdrop-blur-xl dark:border-white/[.06] dark:bg-[#0f1115]/90 sm:px-4 md:px-6">
      <Sheet><SheetTrigger render={<Button variant="ghost" size="icon" className="-ml-1 rounded-xl md:hidden" />}><Menu className="h-5 w-5" /></SheetTrigger><SheetContent side="left" className="w-[280px] border-white/[.08] bg-[#15171c] p-0"><MobileNav /></SheetContent></Sheet>
      <div className="min-w-0 max-w-[560px] flex-1"><GlobalSearch /></div>
      <div className="ml-auto flex shrink-0 items-center gap-2"><QuickCreate /></div>
    </header>
  );
}
