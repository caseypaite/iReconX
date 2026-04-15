import { prisma } from "@/lib/prisma";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      mobileNumber: true,
      role: true,
      isActive: true
    }
  });

  return (
    <Card>
      <CardTitle>User inventory</CardTitle>
      <CardDescription>
        Backed by <code>/api/admin/users</code> for user CRUD and role assignment.
      </CardDescription>
      <div className="mt-5 space-y-3">
        {users.map((user) => (
          <div key={user.id} className="rounded-[18px] border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-white">{user.name ?? user.email}</p>
                <p className="text-sm text-slate-400">{user.email}</p>
                <p className="text-sm text-slate-500">
                  {user.mobileNumber ? `Mobile: ${user.mobileNumber}` : "Mobile not registered"}
                </p>
              </div>
              <div className="text-right text-sm text-slate-300">
                <p>{user.role}</p>
                <p>{user.isActive ? "Active" : "Inactive"}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
