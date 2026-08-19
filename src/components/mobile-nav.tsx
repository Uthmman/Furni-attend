"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  CalendarCheck,
  LayoutDashboard,
  Users,
  Package,
  ShoppingBag,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import React, { useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection } from "firebase/firestore";
import type { Item } from "@/lib/types";

const links = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/employees", label: "Staff", icon: Users },
  { href: "/attendance", label: "Logs", icon: CalendarCheck },
  { href: "/store", label: "Store", icon: Package },
  { href: "/orders", label: "Orders", icon: ShoppingBag },
];

export function MobileNav() {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const firestore = useFirestore();
  const { user } = useUser();
  const [hasMounted, setHasMounted] = React.useState(false);

  const itemsCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, "items");
  }, [firestore, user]);

  const { data: items } = useCollection<Item>(itemsCollectionRef);

  const lowStockCount = useMemo(() => {
    if (!items) return 0;
    return items.filter(item => {
      const threshold = item.lowStockThreshold ?? 5;
      return threshold !== 0 && item.stockLevel <= threshold;
    }).length;
  }, [items]);

  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted || !isMobile) {
    return null;
  }

  return (
    <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-28px)] max-w-md animate-in slide-in-from-bottom-10 duration-500">
      <nav className="flex justify-around items-center p-2 bg-background/70 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-[2rem] ring-1 ring-black/5">
        {links.map((link) => {
          const isActive = link.href === "/" ? pathname === link.href : pathname.startsWith(link.href);
          const isStore = link.href === "/store";

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 p-2 rounded-2xl transition-all duration-300 relative",
                isActive
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105"
                  : "text-muted-foreground hover:bg-accent/50"
              )}
              style={{ minWidth: isActive ? '70px' : '50px' }}
            >
              <link.icon className={cn("transition-transform duration-300", isActive ? "h-5 w-5" : "h-6 w-6")} />
              
              {isStore && lowStockCount > 0 && (
                <span className={cn(
                  "absolute flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black border-2 border-background animate-in zoom-in duration-300",
                  isActive ? "top-0 -right-1 bg-white text-primary" : "-top-1 right-1 bg-destructive text-white"
                )}>
                  {lowStockCount}
                </span>
              )}

              <span className={cn(
                "text-[9px] font-black uppercase tracking-tighter transition-all duration-300",
                isActive ? "block opacity-100 translate-y-0" : "hidden opacity-0 translate-y-1"
              )}>
                {link.label}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  );
}
