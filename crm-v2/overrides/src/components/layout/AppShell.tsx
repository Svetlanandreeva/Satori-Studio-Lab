"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileBottomBar } from "./MobileBottomBar";
import { NotificationChecker } from "@/components/shared/NotificationChecker";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <main className="min-h-dvh w-full">{children}</main>;
  }

  return (
    <>
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-auto bg-[#f4f5f7] p-3 pb-24 sm:p-4 sm:pb-24 md:p-6 md:pb-6">
          {children}
        </main>
      </div>
      <MobileBottomBar />
      <NotificationChecker />
    </>
  );
}
