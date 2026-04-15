import { PropsWithChildren } from "react";

import { OsShell } from "@/components/desktop/os-shell";
import type { NavEntry } from "@/lib/navigation";
import type { AppRole } from "@/types/auth";

type AppShellProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  role: AppRole;
  userName?: string | null;
  userEmail: string;
  navItems: readonly NavEntry[];
}>;

export function AppShell({
  title,
  subtitle,
  role,
  userName,
  userEmail,
  navItems,
  children
}: AppShellProps) {
  return (
    <OsShell navItems={navItems} role={role} subtitle={subtitle} title={title} userEmail={userEmail} userName={userName}>
      {children}
    </OsShell>
  );
}
