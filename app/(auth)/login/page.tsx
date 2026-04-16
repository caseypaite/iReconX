import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getServerSession } from "@/lib/auth/session";
import { loadSiteName } from "@/lib/site-name";

export default async function LoginPage() {
  const session = await getServerSession();
  const siteName = await loadSiteName();

  if (session) {
    redirect(session.role === "ADMIN" ? "/admin" : "/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-5xl rounded-[18px] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8 shadow-2xl">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">{siteName}</p>
            <h1 className="text-4xl font-semibold text-white">Data Analytics and Exploration Studio</h1>
            <p className="max-w-2xl text-base text-slate-400">
              Workspace-first analytics for analysts, plus a governed admin plane for identity, data source, audit, and resource controls.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[18px] border border-slate-800 bg-slate-950/60 p-5">
                <h2 className="font-medium text-white">Analyst dashboard</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Query builder, SQL editor, result grid, visualizations, and metadata inspection.
                </p>
              </div>
              <div className="rounded-[18px] border border-slate-800 bg-slate-950/60 p-5">
                <h2 className="font-medium text-white">Admin dashboard</h2>
                <p className="mt-2 text-sm text-slate-400">
                  User CRUD, role assignment, data source governance, audit trails, and monitoring.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center">
            <LoginForm siteName={siteName} />
          </div>
        </div>
      </div>
    </main>
  );
}
