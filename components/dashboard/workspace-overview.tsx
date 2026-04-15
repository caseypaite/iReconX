import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export function WorkspaceOverview() {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <CardTitle>Analyst workspace</CardTitle>
        <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200">RBAC guarded</Badge>
      </div>
      <CardDescription>
        Users can connect governed data sources, build queries, preview large result sets, and toggle visual summaries without entering the admin surface.
      </CardDescription>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-[18px] border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm font-medium text-white">Connected source</p>
          <p className="mt-2 text-sm text-slate-400">warehouse-main / PostgreSQL</p>
        </div>
        <div className="rounded-[18px] border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm font-medium text-white">Schema focus</p>
          <p className="mt-2 text-sm text-slate-400">public.events</p>
        </div>
        <div className="rounded-[18px] border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm font-medium text-white">Result policy</p>
          <p className="mt-2 text-sm text-slate-400">Preview limited to 250 rows by default</p>
        </div>
      </div>
    </Card>
  );
}
