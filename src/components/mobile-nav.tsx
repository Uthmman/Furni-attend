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
  { href: "/employees", label: "Employees", icon: Users },
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
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
      <div className="bg-background border-t">
        <nav className="flex justify-around items-center p-2">
          {links.map((link) => {
            const isActive = link.href === "/" ? pathname === link.href : pathname.startsWith(link.href);
            const isStore = link.href === "/store";

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 p-1 rounded-lg transition-colors duration-200 relative",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
                style={{ minWidth: '50px' }}
              >
                <link.icon className="h-5 w-5" />
                
                {isStore && lowStockCount > 0 && (
                  <span className="absolute top-0 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-black text-white border-2 border-background animate-in zoom-in duration-300">
                    {lowStockCount}
                  </span>
                )}

                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-tighter",
                  isActive ? "block" : "hidden"
                )}>
                  {link.label}
                </span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  );
}
