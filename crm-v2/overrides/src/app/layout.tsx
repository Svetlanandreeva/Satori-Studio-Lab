import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/layout/PwaRegister";

const inter = Inter({ variable: "--font-sans", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "SATORI — CRM",
  description: "Satori Studio CRM: сделки, клиенты, сообщения, задачи и деньги",
  applicationName: "Satori CRM",
  appleWebApp: { capable: true, title: "Satori CRM", statusBarStyle: "default" },
  icons: { icon: [{ url: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" }], apple: [{ url: "/pwa/apple-180.png", sizes: "180x180" }] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#15171c" }, { media: "(prefers-color-scheme: dark)", color: "#0b0c0f" }],
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
          <PwaRegister />
        </TooltipProvider>
      </body>
    </html>
  );
}
