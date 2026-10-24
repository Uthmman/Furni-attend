
"use client";

import { usePathname, useRouter } from "next/navigation";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/toaster";
import { SidebarProvider, Sidebar } from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/sidebar-nav";
import { Button } from "@/components/ui/button";
import { LogOut, Settings, ShieldAlert, Clock } from "lucide-react";
import { MobileNav } from "@/components/mobile-nav";
import { PageTitleProvider, usePageTitle } from "@/components/page-title-provider";
import React, { useEffect, useState } from "react";
import { FirebaseClientProvider, useUser, useAuth, useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PayrollSettingsDialog } from "./payroll/payroll-settings-dialog";
import { doc } from "firebase/firestore";
import type { AppUser } from "@/lib/types";

function AppHeader() {
  const { title } = usePageTitle();
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleSignOut = async () => {
    if (auth) await auth.signOut();
    router.push('/login');
  }

  const userName = user?.email ? user.email.split('@')[0] : 'Admin';

  return (
      <header className="flex h-16 shrink-0 items-center gap-4 px-4 md:px-6">
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
             <PayrollSettingsDialog isOpen={isSettingsOpen} setIsOpen={setIsSettingsOpen} />
             <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full h-10 w-10">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="flex h-full w-full items-center justify-center rounded-full bg-muted font-bold">
                        {userName?.[0].toUpperCase() || "Z"}
                      </AvatarFallback>
                    </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Workshop Settings</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsSettingsOpen(true)}>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Control Center</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        </div>
    </header>
  )
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar className="hidden md:flex border-r"><SidebarNav /></Sidebar>
        <div className="flex flex-col w-full">
          <AppHeader />
          <main className="flex-1 p-4 md:p-6 pb-24 md:pb-8">{children}</main>
        </div>
      </div>
      <MobileNav />
    </SidebarProvider>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Attendance" />
        <link rel="apple-touch-icon" href="https://placehold.co/180x180/3478f6/white?text=Attendance" />
        <meta name="theme-color" content="#3478f6" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet" />
      </head>
      <body className={cn("font-body", "min-h-screen w-full bg-background text-foreground antialiased selection:bg-primary/10")}>
        <FirebaseClientProvider>
          <PageTitleProvider>
            <AuthGuard>{children}</AuthGuard>
          </PageTitleProvider>
        </FirebaseClientProvider>
        <Toaster />
      </body>
    </html>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: profile, isLoading: isProfileLoading } = useDoc<AppUser>(userDocRef);

  useEffect(() => {
    if (hasMounted && !isUserLoading && !user && pathname !== '/login' && pathname !== '/demo') {
      router.replace('/login');
    }
  }, [user, isUserLoading, router, pathname, hasMounted]);

  if (!hasMounted || isUserLoading || (user && isProfileLoading)) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div
          className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"
          role="status"
        >
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  if (pathname === '/login' || pathname === '/demo') return <>{children}</>;
  
  if (!user) return null;

  // Check Approval Status
  if (profile && profile.status !== 'Approved') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50 text-center">
        <div className="w-full max-w-md p-8 bg-white rounded-3xl shadow-xl border border-amber-100 flex flex-col items-center gap-6">
          <div className="h-20 w-20 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 animate-pulse">
            <Clock className="h-10 w-10" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Approval Pending</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Welcome, <span className="font-bold text-slate-900">{user.email}</span>. Your account has been registered successfully, but it requires approval from the administrator before you can access the system.
            </p>
          </div>
          <div className="w-full h-px bg-slate-100" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Please contact zenbabafurniture@gmail.com</p>
          <Button variant="outline" className="w-full rounded-xl h-12" onClick={() => auth?.signOut()}>
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  if (profile && profile.status === 'Rejected') {
     return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-red-50 text-center">
        <div className="w-full max-w-md p-8 bg-white rounded-3xl shadow-xl border border-red-100 flex flex-col items-center gap-6">
          <div className="h-20 w-20 rounded-full bg-red-50 flex items-center justify-center text-red-500">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Access Denied</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Your registration request for <span className="font-bold text-slate-900">{user.email}</span> was declined by the administrator.
            </p>
          </div>
          <Button variant="destructive" className="w-full rounded-xl h-12" onClick={() => auth?.signOut()}>
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  return <AppLayout>{children}</AppLayout>;
}
