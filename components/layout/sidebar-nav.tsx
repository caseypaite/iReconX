"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, DatabaseZap, LayoutDashboard, ShieldCheck, Users } from "lucide-react";

import type { NavIcon } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type NavItem = {
  href: Route;
  label: string;
  icon: NavIcon;
};

const iconMap = {
  dashboard: LayoutDashboard,
  database: DatabaseZap,
  chart: BarChart3,
  shield: ShieldCheck,
  users: Users
} as const;

export function SidebarNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-2">
      {items.map((item) => {
        const Icon = iconMap[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-[18px] px-3 py-2.5 text-sm transition",
              active
                ? "bg-sky-500/15 text-sky-200"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
