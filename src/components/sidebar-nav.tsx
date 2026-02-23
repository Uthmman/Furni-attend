
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
} from "@/components/ui/sidebar";
import { Logo } from "./logo";
import {
  CalendarCheck,
  LayoutDashboard,
  Users,
  Wallet,
  Palette,
} from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/payroll", label: "Payroll", icon: Wallet },
  { href: "/demo", label: "Demo", icon: Palette },
];

export function SidebarNav() {
  const pathname = usePathname();

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
          {links.map((link) => (
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
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
    </>
  );
}
