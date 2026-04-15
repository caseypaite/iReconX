import { DatabaseZap, ShieldCheck, Users } from "lucide-react";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { DataSource, User } from "@prisma/client";

type AdminOverviewProps = {
  users: Pick<User, "id" | "email" | "mobileNumber" | "role" | "isActive" | "createdAt">[];
  dataSources: Pick<DataSource, "id" | "name" | "type" | "createdAt">[];
  auditCount: number;
};

export function AdminOverview({ users, dataSources, auditCount }: AdminOverviewProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-sky-200" />
            <CardTitle>Security</CardTitle>
          </div>
          <CardDescription>Password rotation, OTP enrollment, and session invalidation.</CardDescription>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-violet-200" />
            <CardTitle>Identities</CardTitle>
          </div>
          <CardDescription>Role assignment, account activation, and admin-only audit visibility.</CardDescription>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <DatabaseZap className="h-5 w-5 text-emerald-200" />
            <CardTitle>Data sources</CardTitle>
          </div>
          <CardDescription>Encrypted connection registration and governed access policies.</CardDescription>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardTitle>{users.length}</CardTitle>
          <CardDescription>Managed identities</CardDescription>
        </Card>
        <Card>
          <CardTitle>{dataSources.length}</CardTitle>
          <CardDescription>Governed data source connections</CardDescription>
        </Card>
        <Card>
          <CardTitle>{auditCount}</CardTitle>
          <CardDescription>Audit log events</CardDescription>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardTitle>User management console</CardTitle>
          <CardDescription>
            Admin-only user CRUD, role assignment, and session invalidation hang off the protected <code>/api/admin/users</code> surface.
          </CardDescription>
          <div className="mt-5 space-y-3">
            {users.map((user) => (
              <div key={user.id} className="rounded-[18px] border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{user.email}</p>
                    <p className="text-sm text-slate-400">Created {user.createdAt.toLocaleDateString()}</p>
                    <p className="text-sm text-slate-500">
                      {user.mobileNumber ? `2FA mobile ${user.mobileNumber}` : "Password-only login"}
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

        <div className="space-y-6">
          <Card>
            <CardTitle>Data source configuration</CardTitle>
            <CardDescription>
              Admins manage connection payloads that are encrypted before persistence and never exposed back to analyst routes.
            </CardDescription>
            <div className="mt-5 space-y-3">
              {dataSources.map((source) => (
                <div key={source.id} className="rounded-[18px] border border-slate-800 bg-slate-900/70 p-4">
                  <p className="font-medium text-white">{source.name}</p>
                  <p className="mt-1 text-sm text-slate-400">{source.type}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Resource usage monitoring</CardTitle>
            <CardDescription>
              This panel is the extension point for query credits, runtime budgets, and concurrency controls.
            </CardDescription>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-[18px] border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-sm text-slate-400">Active analysts</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {users.filter((user) => user.role === "USER" && user.isActive).length}
                </p>
              </div>
              <div className="rounded-[18px] border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-sm text-slate-400">Protected admin routes</p>
                <p className="mt-2 text-2xl font-semibold text-white">/api/admin/*</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
