import { DataGridCard } from "@/components/dashboard/data-grid-card";
import { MetadataCard } from "@/components/dashboard/metadata-card";
import { QueryBuilderCard } from "@/components/dashboard/query-builder";
import { VisualizationCard } from "@/components/dashboard/visualization-card";
import { WorkspaceOverview } from "@/components/dashboard/workspace-overview";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <WorkspaceOverview />
      </section>

      <section className="space-y-4">
        <div className="rounded-[18px] border border-slate-800 bg-slate-900/60 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Build and visualize</p>
          <p className="mt-2 text-sm text-slate-400">
            Create the request shape first, then refine how the result should be rendered for the current analysis pass.
          </p>
        </div>
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <QueryBuilderCard />
          <VisualizationCard />
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-[18px] border border-slate-800 bg-slate-900/60 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Inspect results</p>
          <p className="mt-2 text-sm text-slate-400">
            Review result rows and adjacent schema context together so dataset quality and field behavior stay in one place.
          </p>
        </div>
        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <DataGridCard />
          <MetadataCard />
        </div>
      </section>
    </div>
  );
}
