
"use client";

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/toaster";
import {
  SidebarProvider,
  Sidebar,
} from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/sidebar-nav";
import { Button } from "@/components/ui/button";
import { Bell, User } from "lucide-react";
import { MobileNav } from "@/components/mobile-nav";
import { PageTitleProvider, usePageTitle } from "@/components/page-title-provider";

function AppHeader() {
  const { title } = usePageTitle();
  return (
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-4 border-b bg-background/95 backdrop-blur-sm px-4 md:px-6">
        <div className="flex-1">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
            <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                <Bell className="h-4 w-4" />
                <span className="sr-only">Toggle notifications</span>
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                <User className="h-4 w-4" />
                <span className="sr-only">User menu</span>
            </Button>
        </div>
    </header>
  )
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=PT+Sans:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={cn("font-body", "min-h-screen w-full bg-background text-foreground")}>
        <PageTitleProvider>
          <SidebarProvider>
            <div className="flex min-h-screen w-full">
              <Sidebar className="hidden md:flex border-r">
                <SidebarNav />
              </Sidebar>
              <div className="flex flex-col w-full">
                <AppHeader />
                <main className="flex-1 p-4 md:p-6 pb-24 md:pb-8">
                    {children}
                </main>
              </div>
            </div>
            <MobileNav />
          </SidebarProvider>
        </PageTitleProvider>
        <Toaster />
      </body>
    </html>
  );
}
