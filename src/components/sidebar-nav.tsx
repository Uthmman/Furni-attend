"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
} from "@/components/ui/sidebar";
import { Logo } from "./logo";
import {
  CalendarCheck,
  LayoutDashboard,
  Users,
  Package,
  ShoppingBag,
} from "lucide-react";
import { useMemo } from "react";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection } from "firebase/firestore";
import type { Item } from "@/lib/types";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/store", label: "Store", icon: Package },
  { href: "/orders", label: "Orders", icon: ShoppingBag },
];

export function SidebarNav() {
  const pathname = usePathname();
  const firestore = useFirestore();
  const { user } = useUser();

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

  return (
    <>
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-3 p-2">
          <Logo className="w-8 h-8 text-primary" />
          <div className="flex flex-col">
            <p className="font-headline text-lg font-bold">FurnishWise</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          {links.map((link) => {
            const isStore = link.href === "/store";
            return (
              <SidebarMenuItem key={link.href}>
                <SidebarMenuButton
                  asChild
                  isActive={
                    link.href === "/"
                      ? pathname === link.href
                      : pathname.startsWith(link.href)
                  }
                  tooltip={link.label}
                >
                  <Link href={link.href}>
                    <link.icon className="h-5 w-5" />
                    <span>{link.label}</span>
                  </Link>
                </SidebarMenuButton>
                {isStore && lowStockCount > 0 && (
                  <SidebarMenuBadge className="bg-destructive text-white hover:bg-destructive font-black text-[10px] animate-in slide-in-from-right-2 duration-300">
                    {lowStockCount}
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
    </>
  );
}
