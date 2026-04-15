import { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { requireServerSession } from "@/lib/auth/session";
import { adminNav } from "@/lib/navigation";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireServerSession("ADMIN");

  return (
    <AppShell
      title="Admin control plane"
      subtitle="Manage identities, role assignments, encrypted data source configurations, audit visibility, and platform-level usage controls."
      role={session.role}
      userEmail={session.email}
      userName={session.name}
      navItems={adminNav}
    >
      {children}
    </AppShell>
  );
}
