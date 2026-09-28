import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ variable: "--font-sans", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "SATORI — CRM",
  description: "Satori Studio CRM: сделки, клиенты, сообщения, задачи и деньги",
};

const themeBoot = `try{var t=localStorage.getItem('satori-theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBoot }} /></head>
      <body className="flex min-h-full bg-background text-foreground" suppressHydrationWarning>
        <TooltipProvider>
          <AppShell>{children}</AppShell>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
