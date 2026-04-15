import { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { analystNav } from "@/lib/navigation";
import { requireServerSession } from "@/lib/auth/session";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireServerSession();

  return (
    <AppShell
      title="Analyst workspace"
      subtitle="Connect to governed data sources, shape query payloads, inspect metadata, and move from raw rows to charts without leaving the protected workspace."
      role={session.role}
      userEmail={session.email}
      userName={session.name}
      navItems={analystNav}
    >
      {children}
    </AppShell>
  );
}
