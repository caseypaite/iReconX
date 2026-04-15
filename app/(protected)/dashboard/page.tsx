import { DataGridCard } from "@/components/dashboard/data-grid-card";
import { MetadataCard } from "@/components/dashboard/metadata-card";
import { QueryBuilderCard } from "@/components/dashboard/query-builder";
import { VisualizationCard } from "@/components/dashboard/visualization-card";
import { WorkspaceOverview } from "@/components/dashboard/workspace-overview";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <WorkspaceOverview />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <QueryBuilderCard />
        <VisualizationCard />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <DataGridCard />
        <MetadataCard />
      </div>
    </div>
  );
}

