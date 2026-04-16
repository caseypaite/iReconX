import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { HoverHelperLabel } from "@/components/ui/hover-helper-label";
import { HoverSubtitleTitle } from "@/components/ui/hover-subtitle-title";

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
      <HoverSubtitleTitle
        subtitle={
          <>
            Backed by <code>/api/admin/users</code> for user CRUD and role assignment.
          </>
        }
        title="User inventory"
      />
      <div className="mt-5 space-y-3">
        {users.map((user) => (
          <div key={user.id} className="rounded-[18px] border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <HoverHelperLabel
                  helper={
                    <>
                      <div>{user.email}</div>
                      <div>{user.mobileNumber ? `Mobile: ${user.mobileNumber}` : "Mobile not registered"}</div>
                    </>
                  }
                  label={user.name ?? user.email}
                  labelClassName="font-medium text-white"
                  tooltipClassName="text-sm"
                />
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
