import { z } from "zod";

import { type PluginExecutionResult, pluginExecutionResultSchema } from "@/lib/plugins/protocol";

const viewerCellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const viewerRowSchema = z.record(viewerCellSchema);

export const resultViewerTableSchema = z.object({
  columns: z.array(z.string()).default([]),
  rows: z.array(viewerRowSchema).default([])
});

export const resultViewerVisualSchema = z.object({
  type: z.enum(["bar", "line", "metric-list"]),
  title: z.string(),
  description: z.string().default(""),
  xKey: z.string().default(""),
  yKey: z.string().default(""),
  rows: z.array(viewerRowSchema).default([]),
  metrics: z
    .array(
      z.object({
        label: z.string(),
        value: z.string()
      })
    )
    .default([])
});

export const resultViewerPreviewSchema = z.object({
  title: z.string(),
  summary: z.string(),
  preferredView: z.enum(["table", "visual"]),
  table: resultViewerTableSchema,
  visual: resultViewerVisualSchema.nullable().optional()
});

export const resultViewerRequestSchema = z.object({
  nodeId: z.string().min(1),
  nodeLabel: z.string().min(1),
  result: pluginExecutionResultSchema
});

export type ResultViewerPreview = z.infer<typeof resultViewerPreviewSchema>;

function normalizeCellValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return JSON.stringify(value);
}

function createTableFromRecords(records: Array<Record<string, unknown>>) {
  const limitedRecords = records.slice(0, 25);
  const columns = Array.from(
    limitedRecords.reduce((set, record) => {
      Object.keys(record).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );

  return {
    columns,
    rows: limitedRecords.map((record) =>
      columns.reduce<Record<string, string | number | boolean | null>>((row, column) => {
        row[column] = normalizeCellValue(record[column]);
        return row;
      }, {})
    )
  };
}

export function deriveResultViewerTable(result: PluginExecutionResult) {
  if (result.dataset?.rows?.length) {
    return createTableFromRecords(result.dataset.rows);
  }

  if (result.outputs && typeof result.outputs === "object") {
    const outputEntries = Object.entries(result.outputs);
    const objectArrayEntry = outputEntries.find(
      ([, value]) =>
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    );

    if (objectArrayEntry) {
      return createTableFromRecords(objectArrayEntry[1] as Array<Record<string, unknown>>);
    }

    if (outputEntries.length > 0) {
      return {
        columns: ["key", "value"],
        rows: outputEntries.map(([key, value]) => ({
          key,
          value: normalizeCellValue(value)
        }))
      };
    }
  }

  if (result.logs?.length) {
    return {
      columns: ["line"],
      rows: result.logs.slice(0, 25).map((line) => ({ line }))
    };
  }

  return {
    columns: ["status", "summary"],
    rows: [
      {
        status: result.status,
        summary: result.summary
      }
    ]
  };
}

export function withResultViewerFallback(
  preview: ResultViewerPreview,
  result: PluginExecutionResult,
  nodeLabel: string
): ResultViewerPreview {
  const fallbackTable = deriveResultViewerTable(result);
  const table =
    preview.table.columns.length > 0 && preview.table.rows.length > 0
      ? preview.table
      : fallbackTable;
  const hasVisual =
    preview.visual &&
    (preview.visual.metrics.length > 0 ||
      (preview.visual.rows.length > 0 && preview.visual.xKey.length > 0 && preview.visual.yKey.length > 0));

  return {
    title: preview.title || `${nodeLabel} preview`,
    summary: preview.summary || result.summary,
    preferredView: preview.preferredView === "visual" && hasVisual ? "visual" : "table",
    table,
    visual: hasVisual ? preview.visual : null
  };
}

export function buildResultViewerPrompt(args: {
  nodeLabel: string;
  result: PluginExecutionResult;
}) {
  const promptPayload = {
    status: args.result.status,
    summary: args.result.summary,
    dataset: args.result.dataset
      ? {
          label: args.result.dataset.label,
          rowCount: args.result.dataset.rowCount,
          columns: args.result.dataset.columns,
          sampleRows: args.result.dataset.rows.slice(0, 25),
          metadata: args.result.dataset.metadata ?? null
        }
      : null,
    outputs: args.result.outputs ?? null,
    logs: args.result.logs?.slice(0, 20) ?? [],
    metrics: args.result.metrics ?? null
  };

  return [
    "You create preview specs for iReconX Transform Studio result viewing.",
    "Return ONLY valid JSON.",
    "Use this exact schema:",
    '{"title":"string","summary":"string","preferredView":"table|visual","table":{"columns":["string"],"rows":[{"column":"value"}]},"visual":{"type":"bar|line|metric-list","title":"string","description":"string","xKey":"string","yKey":"string","rows":[{"column":"value"}],"metrics":[{"label":"string","value":"string"}]}}',
    "Rules:",
    "- Always include a useful table view.",
    "- Prefer visualization only when the data clearly fits a bar chart, line chart, or metric list.",
    "- Keep table rows to 25 or fewer.",
    "- Keep visual rows to 12 or fewer.",
    "- For metric-list, leave xKey, yKey, and rows empty and fill metrics.",
    `Generate the preview for the plugin node named "${args.nodeLabel}".`,
    JSON.stringify(promptPayload, null, 2)
  ].join("\n");
}
