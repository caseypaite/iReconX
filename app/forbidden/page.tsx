import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md rounded-[18px] border border-slate-800 bg-slate-950/60 p-8 text-center shadow-2xl">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-300">403</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Access denied</h1>
        <p className="mt-3 text-sm text-slate-400">
          Your current role does not have permission to view this area.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-[18px] bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950"
          >
            Go to workspace
          </Link>
          <Link
            href="/login"
            className="rounded-[18px] border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200"
          >
            Switch account
          </Link>
        </div>
      </div>
    </main>
  );
}
