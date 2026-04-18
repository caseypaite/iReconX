import { z } from "zod";

import { type PluginExecutionResult, pluginExecutionResultSchema } from "@/lib/plugins/protocol";

const viewerCellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const viewerRowSchema = z.record(viewerCellSchema);
const resultViewerSourceKindSchema = z.enum(["dataset", "output", "logs", "status"]);

type ViewerCellValue = z.infer<typeof viewerCellSchema>;
type MetadataField = {
  name: string;
  type: string;
  details?: string;
};
type MetadataSource = {
  sourceKind: z.infer<typeof resultViewerSourceKindSchema>;
  sourceKey: string;
  label: string;
  rowCount: number | null;
  fields: MetadataField[];
  details?: string;
};

export const resultViewerTableSchema = z.object({
  columns: z.array(z.string()).default([]),
  rows: z.array(viewerRowSchema).default([])
});
type ViewerTable = z.infer<typeof resultViewerTableSchema>;

export const resultViewerVisualSchema = z.object({
  type: z.enum(["bar", "line", "metric-list"]),
  title: z.string(),
  description: z.string().default(""),
  rationale: z.string().default(""),
  sourceKind: resultViewerSourceKindSchema.default("dataset"),
  sourceKey: z.string().default(""),
  xKey: z.string().default(""),
  yKey: z.string().default(""),
  metricKeys: z.array(z.string()).default([])
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCellValue(value: unknown): ViewerCellValue {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return JSON.stringify(value);
}

function summarizeValueType(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "list(empty)";
    }

    const entryTypes = Array.from(new Set(value.slice(0, 10).map((entry) => summarizeValueType(entry))));
    return `list(${entryTypes.join("|")})`;
  }

  if (value instanceof Date) {
    return "date";
  }

  if (isPlainObject(value)) {
    return "record";
  }

  return typeof value;
}

function mergeFieldType(current: string | undefined, next: string) {
  if (!current || current === next) {
    return next;
  }

  const values = new Set([...current.split("|"), ...next.split("|")]);
  return Array.from(values).join("|");
}

function inferFieldsFromRecords(records: Array<Record<string, unknown>>) {
  const fields = new Map<string, MetadataField>();

  records.slice(0, 25).forEach((record) => {
    Object.entries(record).forEach(([key, value]) => {
      const nextType = summarizeValueType(value);
      const existing = fields.get(key);
      fields.set(key, {
        name: key,
        type: mergeFieldType(existing?.type, nextType)
      });
    });
  });

  return Array.from(fields.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function buildOutputSources(outputs: Record<string, unknown> | undefined): MetadataSource[] {
  if (!outputs) {
    return [];
  }

  return Object.entries(outputs).flatMap(([key, value]) => {
    if (Array.isArray(value) && value.every((entry) => isPlainObject(entry))) {
      const records = value as Array<Record<string, unknown>>;
      return [
        {
          sourceKind: "output" as const,
          sourceKey: key,
          label: key,
          rowCount: records.length,
          fields: inferFieldsFromRecords(records),
          details: "Array of records"
        }
      ];
    }

    if (isPlainObject(value)) {
      return [
        {
          sourceKind: "output" as const,
          sourceKey: key,
          label: key,
          rowCount: 1,
          fields: inferFieldsFromRecords([value]),
          details: "Single record object"
        }
      ];
    }

    if (Array.isArray(value)) {
      return [
        {
          sourceKind: "output" as const,
          sourceKey: key,
          label: key,
          rowCount: value.length,
          fields: [
            { name: "index", type: "number" },
            { name: "value", type: summarizeValueType(value[0]) }
          ],
          details: "Scalar list"
        }
      ];
    }

    return [
      {
        sourceKind: "output" as const,
        sourceKey: key,
        label: key,
        rowCount: 1,
        fields: [{ name: key, type: summarizeValueType(value), details: "Scalar output" }],
        details: "Scalar output"
      }
    ];
  });
}

function buildStatusSource(result: PluginExecutionResult): MetadataSource {
  return {
    sourceKind: "status",
    sourceKey: "status",
    label: "Execution status",
    rowCount: 1,
    fields: [
      { name: "status", type: "string" },
      { name: "summary", type: "string" },
      { name: "rowCount", type: "number", details: "Dataset row count when available" },
      { name: "durationMs", type: "number", details: "Execution timing metric when available" }
    ],
    details: result.logs?.length ? `${result.logs.length} log lines available separately` : "Execution envelope metadata"
  };
}

function buildLogSource(result: PluginExecutionResult): MetadataSource | null {
  if (!result.logs?.length) {
    return null;
  }

  return {
    sourceKind: "logs",
    sourceKey: "logs",
    label: "Execution logs",
    rowCount: result.logs.length,
    fields: [
      { name: "index", type: "number" },
      { name: "line", type: "string" }
    ],
    details: "Log line metadata only"
  };
}

export function deriveMetadataSources(result: PluginExecutionResult): MetadataSource[] {
  const sources: MetadataSource[] = [];

  if (result.dataset) {
    sources.push({
      sourceKind: "dataset",
      sourceKey: "dataset",
      label: result.dataset.label,
      rowCount: result.dataset.rowCount,
      fields: result.dataset.columns.map((column) => ({
        name: column.key,
        type: column.kind,
        details: column.label !== column.key ? column.label : undefined
      })),
      details: `Dataset from ${result.dataset.sourceKind}`
    });
  }

  sources.push(...buildOutputSources(result.outputs));
  sources.push(buildStatusSource(result));

  const logSource = buildLogSource(result);
  if (logSource) {
    sources.push(logSource);
  }

  return sources;
}

export function deriveResultViewerTable(result: PluginExecutionResult): ViewerTable {
  const rows = deriveMetadataSources(result).flatMap((source) =>
    source.fields.map<Record<string, ViewerCellValue>>((field) => ({
      source: source.label,
      sourceKind: source.sourceKind,
      field: field.name,
      type: field.type,
      rows: source.rowCount,
      details: field.details ?? source.details ?? null
    }))
  );

  if (rows.length > 0) {
    return {
      columns: ["source", "sourceKind", "field", "type", "rows", "details"],
      rows
    };
  }

  return {
    columns: ["field", "type", "details"],
    rows: [
      {
        field: "status",
        type: "string",
        details: result.summary
      }
    ]
  };
}

function getVisualSourceRows(result: PluginExecutionResult, visual: NonNullable<ResultViewerPreview["visual"]>) {
  if (visual.sourceKind === "dataset") {
    return (result.dataset?.rows ?? []) as Array<Record<string, unknown>>;
  }

  if (visual.sourceKind === "logs") {
    return (result.logs ?? []).map((line, index) => ({
      index,
      line
    })) as Array<Record<string, unknown>>;
  }

  if (visual.sourceKind === "status") {
    return [
      {
        status: result.status,
        summary: result.summary,
        rowCount: result.dataset?.rowCount ?? null,
        durationMs: result.metrics?.durationMs ?? null
      }
    ] as Array<Record<string, unknown>>;
  }

  const outputValue = visual.sourceKey ? result.outputs?.[visual.sourceKey] : null;

  if (Array.isArray(outputValue) && outputValue.every((entry) => isPlainObject(entry))) {
    return outputValue as Array<Record<string, unknown>>;
  }

  if (isPlainObject(outputValue)) {
    return [outputValue] as Array<Record<string, unknown>>;
  }

  if (Array.isArray(outputValue)) {
    return outputValue.map((value, index) => ({
      index,
      value
    })) as Array<Record<string, unknown>>;
  }

  if (outputValue !== undefined) {
    return [
      {
        [visual.sourceKey || "value"]: outputValue
      }
    ] as Array<Record<string, unknown>>;
  }

  return [] as Array<Record<string, unknown>>;
}

function getMetricValue(result: PluginExecutionResult, key: string): string | null {
  if (key === "rowCount") {
    return result.dataset ? String(result.dataset.rowCount) : null;
  }

  if (key === "durationMs") {
    return result.metrics?.durationMs !== undefined ? `${result.metrics.durationMs} ms` : null;
  }

  if (key === "status") {
    return result.status;
  }

  if (key === "summary") {
    return result.summary;
  }

  const outputValue = result.outputs?.[key];

  if (typeof outputValue === "string" || typeof outputValue === "number" || typeof outputValue === "boolean") {
    return String(outputValue);
  }

  return null;
}

function canRenderVisual(preview: ResultViewerPreview["visual"], result: PluginExecutionResult) {
  if (!preview) {
    return false;
  }

  if (preview.type === "metric-list") {
    return preview.metricKeys.some((metricKey) => getMetricValue(result, metricKey) !== null);
  }

  if (!preview.xKey || !preview.yKey) {
    return false;
  }

  return getVisualSourceRows(result, preview).some((row) => typeof row[preview.yKey] === "number" && Number.isFinite(row[preview.yKey] as number));
}

export function getResultViewerVisualData(result: PluginExecutionResult, preview: ResultViewerPreview) {
  const visual = preview.visual;

  if (!visual || !canRenderVisual(visual, result)) {
    return null;
  }

  if (visual.type === "metric-list") {
    const metrics = visual.metricKeys
      .map((metricKey) => ({
        label: metricKey,
        value: getMetricValue(result, metricKey)
      }))
      .filter((metric): metric is { label: string; value: string } => metric.value !== null);

    return {
      type: "metric-list" as const,
      metrics
    };
  }

  const rows = getVisualSourceRows(result, visual)
    .filter((row) => typeof row[visual.yKey] === "number" && Number.isFinite(row[visual.yKey] as number))
    .slice(0, 12)
    .map((row) => ({
      label: String(row[visual.xKey] ?? ""),
      value: row[visual.yKey] as number
    }))
    .filter((row) => row.label.length > 0);

  if (rows.length === 0) {
    return null;
  }

  return {
    type: visual.type,
    rows
  };
}

export function withResultViewerFallback(
  preview: ResultViewerPreview,
  result: PluginExecutionResult,
  nodeLabel: string
): ResultViewerPreview {
  const fallbackTable = deriveResultViewerTable(result);
  const table = preview.table.columns.length > 0 && preview.table.rows.length > 0 ? preview.table : fallbackTable;
  const visual = preview.visual && canRenderVisual(preview.visual, result) ? preview.visual : null;

  return {
    title: preview.title || `${nodeLabel} preview`,
    summary: preview.summary || result.summary,
    preferredView: preview.preferredView === "visual" && visual ? "visual" : "table",
    table,
    visual
  };
}

export function buildResultViewerPrompt(args: {
  nodeLabel: string;
  result: PluginExecutionResult;
}) {
  const metadataSources = deriveMetadataSources(args.result).map((source) => ({
    sourceKind: source.sourceKind,
    sourceKey: source.sourceKey,
    label: source.label,
    rowCount: source.rowCount,
    fields: source.fields,
    details: source.details ?? null
  }));
  const outputVariables = Object.entries(args.result.outputs ?? {}).map(([key, value]) => ({
    name: key,
    type: summarizeValueType(value)
  }));
  const promptPayload = {
    status: args.result.status,
    summary: args.result.summary,
    dataset: args.result.dataset
      ? {
          label: args.result.dataset.label,
          sourceKind: args.result.dataset.sourceKind,
          rowCount: args.result.dataset.rowCount,
          columns: args.result.dataset.columns.map((column) => ({
            name: column.key,
            label: column.label,
            type: column.kind
          })),
          metadataKeys: Object.keys(args.result.dataset.metadata ?? {})
        }
      : null,
    availableSources: metadataSources,
    outputVariables,
    logCount: args.result.logs?.length ?? 0,
    metrics: args.result.metrics
      ? Object.entries(args.result.metrics).map(([key, value]) => ({
          name: key,
          type: typeof value
        }))
      : []
  };

  return [
    "You create metadata-only chart recommendations for iReconX Transform Studio.",
    "Return ONLY valid JSON.",
    "Never echo raw rows, full output payloads, or sample data values.",
    "Use only the provided field names, variable names, source names, row counts, and type metadata.",
    "Use this exact schema:",
    '{"title":"string","summary":"string","preferredView":"table|visual","table":{"columns":["string"],"rows":[{"column":"value"}]},"visual":{"type":"bar|line|metric-list","title":"string","description":"string","rationale":"string","sourceKind":"dataset|output|logs|status","sourceKey":"string","xKey":"string","yKey":"string","metricKeys":["string"]}}',
    "Rules:",
    "- The table must list metadata only, such as fields, variable names, source names, and inferred types.",
    "- Prefer visual only when the metadata shows a clear chart mapping.",
    "- For bar and line charts, choose one sourceKind/sourceKey pair and set xKey/yKey to field names from that source.",
    "- Only choose yKey fields that are numeric.",
    "- For metric-list, leave xKey and yKey empty and fill metricKeys with status, summary, rowCount, durationMs, or scalar output variable names.",
    `Generate the preview for the plugin node named "${args.nodeLabel}".`,
    JSON.stringify(promptPayload, null, 2)
  ].join("\n");
}
