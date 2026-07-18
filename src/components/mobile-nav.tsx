
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
import React from 'react';

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
  const [hasMounted, setHasMounted] = React.useState(false);

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
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                                "flex flex-col items-center justify-center gap-1 p-1 rounded-lg transition-colors duration-200",
                                isActive
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-accent"
                            )}
                            style={{ minWidth: '50px' }}
                        >
                            <link.icon className="h-5 w-5" />
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
