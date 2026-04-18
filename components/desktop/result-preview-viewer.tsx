"use client";

import type { PluginExecutionResult } from "@/lib/plugins/protocol";
import { getResultViewerVisualData, type ResultViewerPreview } from "@/lib/ai/result-viewer";
import { Button } from "@/components/ui/button";

type ResultPreviewViewerProps = {
  mode: "table" | "visual";
  onModeChange: (mode: "table" | "visual") => void;
  preview: ResultViewerPreview;
  result: PluginExecutionResult;
};

const compactButtonClassName = "h-auto rounded-none px-2 py-1 text-[11px]";

function ResultPreviewTable({ preview }: { preview: ResultViewerPreview }) {
  if (preview.table.columns.length === 0 || preview.table.rows.length === 0) {
    return <p className="text-xs text-slate-400">No tabular preview rows are available.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-none border border-white/10">
      <table className="min-w-max w-full table-fixed divide-y divide-white/10 text-[11px] leading-tight text-slate-200">
        <thead className="bg-white/5">
          <tr>
            {preview.table.columns.map((column) => (
              <th key={column} className="px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                <span className="block max-w-[120px] truncate" title={column}>
                  {column}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {preview.table.rows.map((row, index) => (
            <tr key={`${index}-${String(row[preview.table.columns[0]] ?? "row")}`} className="bg-slate-950/20">
              {preview.table.columns.map((column) => (
                <td key={column} className="px-2 py-1 align-top text-slate-200">
                  <span className="block max-w-[120px] truncate" title={row[column] === null ? "" : String(row[column])}>
                    {row[column] === null ? <span className="text-slate-500">-</span> : String(row[column])}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultPreviewVisual({ preview, result }: { preview: ResultViewerPreview; result: PluginExecutionResult }) {
  if (!preview.visual) {
    return <p className="text-xs text-slate-400">No visual preview is available for this result.</p>;
  }

  const visualData = getResultViewerVisualData(result, preview);

  if (!visualData) {
    return <p className="text-xs text-slate-400">The AI recommendation could not be rendered from the available local result data.</p>;
  }

  if (visualData.type === "metric-list") {
    return (
      <div className="space-y-3">
        <div className="rounded-none border border-white/10 bg-slate-950/25 p-3">
          <p className="text-sm font-medium text-white">{preview.visual.title}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">{preview.visual.description}</p>
          {preview.visual.rationale ? <p className="mt-2 text-[11px] text-slate-400">Why this chart: {preview.visual.rationale}</p> : null}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {visualData.metrics.map((metric) => (
            <div key={metric.label} className="rounded-none border border-white/10 bg-slate-950/25 p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{metric.label}</p>
              <p className="mt-2 text-sm font-medium text-white">{metric.value}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const data = visualData.rows;

  if (data.length === 0) {
    return <p className="text-xs text-slate-400">The visual preview did not include plottable numeric data.</p>;
  }

  if (preview.visual.type === "bar") {
    const maxValue = Math.max(...data.map((entry) => entry.value), 1);

    return (
      <div className="space-y-2">
        {data.map((entry) => (
          <div key={entry.label} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
              <span className="truncate">{entry.label}</span>
              <span>{entry.value}</span>
            </div>
            <div className="h-2 rounded-none bg-white/5">
              <div className="h-2 rounded-none bg-sky-400/70" style={{ width: `${(entry.value / maxValue) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const width = 320;
  const height = 180;
  const maxValue = Math.max(...data.map((entry) => entry.value), 1);
  const minValue = Math.min(...data.map((entry) => entry.value), 0);
  const range = Math.max(maxValue - minValue, 1);
  const points = data
    .map((entry, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * (width - 32) + 16;
      const y = height - 16 - ((entry.value - minValue) / range) * (height - 32);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="space-y-3">
      <div className="rounded-none border border-white/10 bg-slate-950/25 p-3">
        <p className="text-sm font-medium text-white">{preview.visual.title}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">{preview.visual.description}</p>
        {preview.visual.rationale ? <p className="mt-2 text-[11px] text-slate-400">Why this chart: {preview.visual.rationale}</p> : null}
      </div>
      <svg className="w-full rounded-none border border-white/10 bg-slate-950/25" viewBox={`0 0 ${width} ${height}`}>
        <polyline fill="none" points={points} stroke="rgba(56,189,248,0.95)" strokeWidth="3" />
        {data.map((entry, index) => {
          const x = (index / Math.max(data.length - 1, 1)) * (width - 32) + 16;
          const y = height - 16 - ((entry.value - minValue) / range) * (height - 32);
          return <circle key={`${entry.label}-${index}`} cx={x} cy={y} fill="rgba(191,219,254,0.95)" r="4" />;
        })}
      </svg>
      <div className="grid gap-2 md:grid-cols-2">
        {data.map((entry) => (
          <div key={entry.label} className="rounded-none border border-white/10 bg-slate-950/25 px-2 py-1.5 text-[11px] text-slate-300">
            <span className="block truncate">{entry.label}</span>
            <span className="mt-1 block text-slate-100">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResultPreviewViewer({
  mode,
  onModeChange,
  preview,
  result
}: ResultPreviewViewerProps) {
  const canShowVisual = Boolean(preview.visual);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canShowVisual ? (
          <Button
            className={compactButtonClassName}
            onClick={() => onModeChange("visual")}
            type="button"
            variant={mode === "visual" ? "default" : "outline"}
          >
            Visualization
          </Button>
        ) : null}
        <Button
          className={compactButtonClassName}
          onClick={() => onModeChange("table")}
          type="button"
          variant={mode === "table" ? "default" : "outline"}
        >
          Table
        </Button>
      </div>
      {mode === "visual" && canShowVisual ? <ResultPreviewVisual preview={preview} result={result} /> : <ResultPreviewTable preview={preview} />}
    </div>
  );
}
