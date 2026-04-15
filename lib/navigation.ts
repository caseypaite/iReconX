import type { Route } from "next";

export type NavIcon = "dashboard" | "database" | "chart" | "shield" | "users";

export type NavEntry = {
  href: Route;
  label: string;
  icon: NavIcon;
};

export const analystNav = [
  { href: "/dashboard", label: "Workspace", icon: "dashboard" },
  { href: "/dashboard/explorer", label: "Explorer", icon: "database" },
  { href: "/dashboard/visualizations", label: "Visualizations", icon: "chart" }
] as const satisfies readonly NavEntry[];

export const adminNav = [
  { href: "/admin", label: "Overview", icon: "shield" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/data-sources", label: "Data Sources", icon: "database" }
] as const satisfies readonly NavEntry[];
