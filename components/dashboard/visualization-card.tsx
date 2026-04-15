"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { useExplorerStore } from "@/lib/stores/explorer-store";

const chartOptions = ["bar", "line", "scatter", "heatmap"] as const;

export function VisualizationCard() {
  const { chart, setChart } = useExplorerStore();

  return (
    <Card className="h-full">
      <CardTitle>Visualization Engine</CardTitle>
      <CardDescription>
        Toggle among chart types while keeping the query result contract stable for future rendering adapters.
      </CardDescription>
      <div className="mt-5 flex flex-wrap gap-2">
        {chartOptions.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setChart(option)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              chart === option
                ? "border-sky-500 bg-sky-500/10 text-sky-200"
                : "border-slate-700 text-slate-300"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="mt-6 rounded-[18px] border border-dashed border-slate-700 bg-slate-900/70 p-6">
        <p className="text-sm text-slate-300">
          Rendering adapter placeholder for <Badge className="ml-2">{chart}</Badge>
        </p>
      </div>
    </Card>
  );
}
