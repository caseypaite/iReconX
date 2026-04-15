import { prisma } from "@/lib/prisma";
import { AdminOverview } from "@/components/admin/admin-overview";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [users, dataSources, auditCount] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, email: true, mobileNumber: true, role: true, isActive: true, createdAt: true }
    }),
    prisma.dataSource.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, type: true, createdAt: true }
    }),
    prisma.auditLog.count()
  ]);

  return <AdminOverview users={users} dataSources={dataSources} auditCount={auditCount} />;
}
