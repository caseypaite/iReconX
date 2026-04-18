import { z } from "zod";

import type { StudioCellValue, StudioColumn, StudioDataset, StudioDatasetSourceKind, StudioRow } from "@/lib/data-studio";
import { sourceConnectionSchema, type SourceConnection } from "@/lib/source-connection";

export const PLUGIN_PROTOCOL_VERSION = "ireconx.plugin.v1";
export const pluginRuntimeOptions = ["browser", "server", "both"] as const;
export const pluginScopeOptions = ["personal", "shared"] as const;
export const pluginProviderOptions = ["copilot", "gemini", "mistral"] as const;
export const pluginExecutionTargetOptions = ["browser", "server"] as const;

export type PluginRuntimeValue = (typeof pluginRuntimeOptions)[number];
export type PluginScopeValue = (typeof pluginScopeOptions)[number];
export type PluginProviderId = (typeof pluginProviderOptions)[number];
export type PluginExecutionTarget = (typeof pluginExecutionTargetOptions)[number];
export type PluginDatabaseHandle = {
  driver: "postgres" | "mysql";
  query: (sql: string, params?: readonly unknown[]) => Promise<Array<Record<string, unknown>>>;
};

export type PluginExecutionStatus = "success" | "error";

const studioCellSchema: z.ZodType<StudioCellValue> = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const studioRowSchema: z.ZodType<StudioRow> = z.record(studioCellSchema);
const studioColumnSchema: z.ZodType<StudioColumn> = z.object({
  key: z.string(),
  label: z.string(),
  kind: z.enum(["string", "number", "boolean", "date", "mixed", "empty"])
});
const datasetMetadataSchema: z.ZodType<Record<string, StudioCellValue>> = z.record(studioCellSchema);

export const studioDatasetSchema: z.ZodType<StudioDataset> = z.object({
  label: z.string(),
  sourceKind: z.enum(["upload", "data-source-catalog", "generated"]) as z.ZodType<StudioDatasetSourceKind>,
  rowCount: z.number().int().nonnegative(),
  columns: z.array(studioColumnSchema),
  rows: z.array(studioRowSchema),
  metadata: datasetMetadataSchema.optional()
});

export const pluginRuntimeSchema = z.enum(pluginRuntimeOptions);
export const pluginScopeSchema = z.enum(pluginScopeOptions);
export const pluginProviderSchema = z.enum(pluginProviderOptions);
export const pluginExecutionTargetSchema = z.enum(pluginExecutionTargetOptions);

export const pluginExecutionResultSchema = z.object({
  protocolVersion: z.literal(PLUGIN_PROTOCOL_VERSION),
  status: z.enum(["success", "error"]),
  summary: z.string(),
  dataset: studioDatasetSchema.nullable().optional(),
  outputs: z.record(z.any()).optional(),
  logs: z.array(z.string()).optional(),
  metrics: z
    .object({
      durationMs: z.number().nonnegative().optional()
    })
    .optional()
});

export type PluginExecutionResult = z.infer<typeof pluginExecutionResultSchema>;

export const pluginExecutionInputSchema = z.object({
  protocolVersion: z.literal(PLUGIN_PROTOCOL_VERSION),
  dataset: studioDatasetSchema.nullable(),
  payload: z.record(z.any()).nullable(),
  params: z.record(z.any()),
  connection: sourceConnectionSchema.nullable().optional(),
  upstream: z.array(pluginExecutionResultSchema),
  invocation: z.object({
    pluginId: z.string(),
    pluginName: z.string(),
    executionTarget: pluginExecutionTargetSchema
  })
});

export type PluginExecutionInput = z.infer<typeof pluginExecutionInputSchema> & {
  db?: PluginDatabaseHandle | null;
};

export const pluginManifestSchema = z.object({
  protocolVersion: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  runtime: z.string().optional(),
  inputForm: z.string().trim().optional()
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

type PluginRuntimeDataset = StudioDataset & {
  schema: {
    fields: Array<{
      name: string;
      label: string;
      type: StudioColumn["kind"];
    }>;
  };
};

export const generatedPluginDraftSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  sourceCode: z.string().min(1)
});

export type GeneratedPluginDraft = z.infer<typeof generatedPluginDraftSchema>;

export type PluginDefinitionRecord = {
  id: string;
  name: string;
  description: string;
  sourceCode: string;
  protocolVersion: string;
  generationPrompt: string;
  provider: PluginProviderId | null;
  providerModel: string;
  scope: PluginScopeValue;
  runtime: PluginRuntimeValue;
  ownerId: string | null;
  ownerLabel: string;
  createdAt: string;
  updatedAt: string;
};

export const pluginDefinitionPayloadSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Plugin name is required."),
  description: z.string().trim().default(""),
  sourceCode: z.string().trim().min(1, "Plugin source code is required."),
  protocolVersion: z.literal(PLUGIN_PROTOCOL_VERSION),
  generationPrompt: z.string().default(""),
  provider: pluginProviderSchema.nullable().optional(),
  providerModel: z.string().default(""),
  scope: pluginScopeSchema,
  runtime: pluginRuntimeSchema
});

export type PluginDefinitionPayload = z.infer<typeof pluginDefinitionPayloadSchema>;

export const pluginGenerationRequestSchema = z.object({
  provider: pluginProviderSchema.optional(),
  runtime: pluginRuntimeSchema,
  scope: pluginScopeSchema,
  userPrompt: z.string().trim().min(1, "Prompt is required."),
  dataset: studioDatasetSchema.nullable().optional(),
  payload: z.record(z.any()).nullable().optional()
});

const forbiddenPluginSourceChecks: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\bdocument\s*\./i,
    message: "Plugins cannot access DOM APIs like document.getElementById; use input.dataset, input.payload, and helpers instead."
  },
  {
    pattern: /\bwindow\s*\./i,
    message: "Plugins cannot access window-scoped browser APIs; use the standardized plugin input instead."
  },
  {
    pattern: /\b(getElementById|querySelector|querySelectorAll|addEventListener)\s*\(/i,
    message: "Plugins cannot query or manipulate page elements."
  },
  {
    pattern: /\b(localStorage|sessionStorage)\b/i,
    message: "Plugins cannot read or write browser storage."
  },
  {
    pattern: /\b(fetch|XMLHttpRequest|WebSocket)\b/i,
    message: "Plugins cannot access network APIs."
  },
  {
    pattern: /\b(require|import\s*\(|process\s*\.)/i,
    message: "Plugins cannot import modules or access process state."
  }
];

export function createPluginExecutionInput(args: {
  pluginId: string;
  pluginName: string;
  executionTarget: PluginExecutionTarget;
  dataset: StudioDataset | null;
  payload?: Record<string, unknown> | null;
  params?: Record<string, unknown>;
  connection?: SourceConnection | null;
  db?: PluginDatabaseHandle | null;
  upstream?: PluginExecutionResult[];
}): PluginExecutionInput {
  const runtimeDataset = args.dataset
    ? ({
        ...args.dataset,
        schema: {
          fields: args.dataset.columns.map((column) => ({
            name: column.key,
            label: column.label,
            type: column.kind
          }))
        }
      } satisfies PluginRuntimeDataset)
    : null;

  return {
    protocolVersion: PLUGIN_PROTOCOL_VERSION,
    dataset: runtimeDataset,
    payload: args.payload ?? null,
    params: args.params ?? {},
    connection: args.connection ?? null,
    db: args.db ?? null,
    upstream: args.upstream ?? [],
    invocation: {
      pluginId: args.pluginId,
      pluginName: args.pluginName,
      executionTarget: args.executionTarget
    }
  };
}

export function normalizePluginResult(candidate: unknown): PluginExecutionResult {
  const parsed = pluginExecutionResultSchema.safeParse(candidate);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Plugin returned an invalid result envelope.");
  }

  return parsed.data;
}

export function runtimeSupportsTarget(runtime: PluginRuntimeValue, target: PluginExecutionTarget) {
  return runtime === "both" || runtime === target;
}

export function validatePluginSourceCode(sourceCode: string) {
  return forbiddenPluginSourceChecks
    .filter((check) => check.pattern.test(sourceCode))
    .map((check) => check.message);
}

export function assertValidPluginSourceCode(sourceCode: string) {
  const issues = validatePluginSourceCode(sourceCode);

  if (issues.length > 0) {
    throw new Error(issues[0]);
  }
}

export function buildPluginGenerationPrompt(args: {
  runtime: PluginRuntimeValue;
  userPrompt: string;
  dataset: StudioDataset | null;
  payload: Record<string, unknown> | null;
}) {
  const datasetSummary = args.dataset
    ? {
        label: args.dataset.label,
        sourceKind: args.dataset.sourceKind,
        rowCount: args.dataset.rowCount,
        columns: args.dataset.columns.map((column) => ({ key: column.key, kind: column.kind })),
        sampleRows: args.dataset.rows.slice(0, 3)
      }
    : null;

  return [
    "You are generating a JavaScript plugin module for iReconX Data Studio.",
    `The plugin MUST implement protocol version ${PLUGIN_PROTOCOL_VERSION}.`,
    `The plugin runtime target is ${args.runtime}.`,
    "Return ONLY valid JSON with this exact shape:",
    '{"name":"string","description":"string","sourceCode":"string"}',
    "sourceCode must be a CommonJS-compatible module with:",
    '1. const plugin = { protocolVersion: "ireconx.plugin.v1", name: "...", description: "...", runtime: "browser|server|both", inputForm?: "<label>Threshold <input name=\\"threshold\\" type=\\"number\\" value=\\"10\\" /></label>" }',
    "2. async function run(input, helpers) { ... }",
    "3. module.exports = { plugin, run }",
     "run(input, helpers) receives:",
     "- input.dataset: current StudioDataset or null",
     "- input.dataset.schema.fields: compatibility alias for dataset columns with { name, label, type }",
     "- input.payload: arbitrary JSON payload or null",
     "- input.params: plugin step parameters",
     "- input.connection: Source node connection metadata; when running on the server it may include credential fields",
     "- input.db: live server-side database handle when Source is configured on a server run; use await input.db.query(sql, params)",
     "- input.upstream: prior plugin results in the chain",
     "- input.invocation: plugin metadata and requested execution target",
    "If plugin.inputForm is present, every control must have a name attribute so configured values flow into input.params.",
    "run must return:",
    '{"protocolVersion":"ireconx.plugin.v1","status":"success|error","summary":"string","dataset":null|StudioDataset,"outputs":{},"logs":[]}',
    `Dataset context: ${JSON.stringify(datasetSummary)}`,
    `Payload context: ${JSON.stringify(args.payload ?? null)}`,
    `User request: ${args.userPrompt}`
  ].join("\n");
}
