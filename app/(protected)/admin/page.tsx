import { prisma } from "@/lib/prisma";
import { AdminOverview } from "@/components/admin/admin-overview";
import { loadAdminSettings } from "@/lib/admin/settings";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [users, settings] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, email: true, name: true, mobileNumber: true, role: true, isActive: true, createdAt: true }
    }),
    loadAdminSettings()
  ]);

  return <AdminOverview users={users} settings={settings} />;
}
