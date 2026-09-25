"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileBottomBar } from "./MobileBottomBar";
import { NotificationChecker } from "@/components/shared/NotificationChecker";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return <main className="min-h-dvh w-full">{children}</main>;

  return (
    <>
      <Sidebar />
      <div className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f3f4f6] dark:bg-[#0f1115]">
        <Header />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-24 sm:p-4 sm:pb-24 md:p-5 md:pb-6 lg:p-6">
          {children}
        </main>
      </div>
      <MobileBottomBar />
      <NotificationChecker />
    </>
  );
}
