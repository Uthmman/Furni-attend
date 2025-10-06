import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
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

export const metadata: Metadata = {
  title: "FurnishWise",
  description: "Furniture and Order Management",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
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
        <SidebarProvider>
          <div className="md:flex">
            <Sidebar className="hidden md:flex border-r">
              <SidebarNav />
            </Sidebar>
            <div className="flex flex-col w-full">
              <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur-sm px-6">
                  <div className="flex-1">
                    {/* Can add a page title here if needed */}
                  </div>
                  <div className="flex items-center gap-4">
                      <Button variant="ghost" size="icon" className="rounded-full">
                          <Bell className="h-5 w-5" />
                          <span className="sr-only">Toggle notifications</span>
                      </Button>
                      <Button variant="ghost" size="icon" className="rounded-full">
                          <User className="h-5 w-5" />
                          <span className="sr-only">User menu</span>
                      </Button>
                  </div>
              </header>
              <main className="flex-1 p-6 pb-24 md:pb-8">
                  {children}
              </main>
            </div>
          </div>
          <MobileNav />
        </SidebarProvider>
        <Toaster />
      </body>
    </html>
  );
}
