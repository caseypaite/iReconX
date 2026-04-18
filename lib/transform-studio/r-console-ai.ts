import { z } from "zod";

import { pluginProviderSchema, studioDatasetSchema } from "@/lib/plugins/protocol";
import type { SourceConnection } from "@/lib/source-connection";
import type { TidyverseSourceSchemaDefinition } from "@/lib/tidyverse/schema-introspection";

const tidyverseSourceSchemaColumnSchema = z.object({
  name: z.string().min(1),
  dataType: z.string().min(1),
  isNullable: z.boolean()
});

export const tidyverseSourceSchemaDefinitionSchema = z.object({
  scope: z.enum(["table", "schema"]),
  truncated: z.boolean(),
  tables: z.array(
    z.object({
      schema: z.string().min(1),
      name: z.string().min(1),
      columns: z.array(tidyverseSourceSchemaColumnSchema)
    })
  )
});

export const rConsoleGenerationRequestSchema = z.object({
  provider: pluginProviderSchema.optional(),
  userPrompt: z.string().trim().min(1, "Prompt is required."),
  dataset: studioDatasetSchema.nullable().optional(),
  payload: z.record(z.any()).nullable().optional(),
  sourceConnectionId: z.string().min(1).nullable().optional(),
  sourceSchema: tidyverseSourceSchemaDefinitionSchema.nullable().optional(),
  sourceDataDictionary: z.string().nullable().optional(),
  currentScript: z.string().optional()
});

export const generatedRConsoleScriptSchema = z.object({
  script: z.string().trim().min(1, "Generated tidyverse script is required.")
});

function summarizeValueType(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "list(empty)";
    }

    return `list(${Array.from(new Set(value.slice(0, 8).map((entry) => summarizeValueType(entry)))).join("|")})`;
  }

  if (typeof value === "object") {
    return "record";
  }

  return typeof value;
}

export function buildRConsoleGenerationPrompt(args: {
  userPrompt: string;
  dataset: z.infer<typeof studioDatasetSchema> | null;
  payload?: Record<string, unknown> | null;
  connection?: Omit<SourceConnection, "username" | "password"> | null;
  sourceSchema?: TidyverseSourceSchemaDefinition | null;
  sourceDataDictionary?: string | null;
  currentScript?: string;
}) {
  const promptPayload = {
    dataset: args.dataset
      ? {
          label: args.dataset.label,
          sourceKind: args.dataset.sourceKind,
          rowCount: args.dataset.rowCount,
          columns: args.dataset.columns.map((column) => ({
            name: column.key,
            label: column.label,
            type: column.kind
          }))
        }
      : null,
    payload: args.payload
      ? Object.entries(args.payload).map(([key, value]) => ({
          name: key,
          type: summarizeValueType(value)
        }))
      : [],
    connection: args.connection
      ? {
          sourceId: args.connection.sourceId,
          sourceName: args.connection.sourceName,
          sourceKind: args.connection.sourceKind,
          type: args.connection.type,
          database: args.connection.database ?? null,
          schema: args.connection.schema,
          tableSchema: args.connection.tableSchema ?? null,
          tableName: args.connection.tableName ?? null
        }
      : null,
    sourceSchema: args.sourceSchema
      ? {
          scope: args.sourceSchema.scope,
          truncated: args.sourceSchema.truncated,
          tables: args.sourceSchema.tables.map((table) => ({
            schema: table.schema,
            name: table.name,
            columns: table.columns.map((column) => ({
              name: column.name,
              dataType: column.dataType,
              nullable: column.isNullable
            }))
          }))
        }
      : null,
    sourceDataDictionary: args.sourceDataDictionary?.trim() || null,
    currentScript: args.currentScript?.trim() || null
  };

  return [
    "You write tidyverse-step scripts for iReconX Transform Studio.",
    "Return ONLY valid JSON in this exact shape:",
    '{"script":"R code here"}',
    "Never wrap the JSON in markdown fences.",
    "The generated R code runs in an environment with these variables:",
    "- df_input: a tibble created from the loaded dataset",
    "- payload: a named list or NULL",
    "- params: a named list",
    "- upstream: prior execution envelopes",
    "- connection: workflow connection metadata or NULL",
    "- db: a live DBI connection when connection is available, otherwise NULL",
    "- source_tbl: a lazily resolved dbplyr table for the upstream source when a source table is available, otherwise NULL",
    "- get_source_tbl(): resolves the upstream source table on demand and throws a descriptive error when it cannot be opened",
    "- log_message(...): append messages to the console log",
    "- result_dataset: optional dataset data frame/tibble to return",
    "Rules:",
    "- Analyze only the provided dataset columns, sourceSchema table/column definitions, and sourceDataDictionary. Do not invent columns, tables, schemas, or business meanings beyond that context.",
    "- Generate executable R code, not explanation.",
    "- Prefer dplyr, dbplyr, tibble, and base R that match the available schema.",
    "- Always assign result <- list(...).",
    '- Include at least result$summary as a concise string.',
    "- If the prompt implies a transformed table, include result$dataset as a data frame/tibble.",
    "- If the script uses db or connection, guard for missing connection with an explicit error.",
    "- Never call DBI::dbConnect, pool::dbPool, or create a new connection from credentials. The db handle is already forwarded by tidyverse-entry.",
    "- Treat connection/db as lazily forwarded workflow access. Preserve lazy loading semantics and avoid eager full-table reads.",
    "- When source_tbl is available, prefer using source_tbl directly for lazy dbplyr work instead of rebuilding the table reference manually.",
    "- Only call collect() on the final small result you need to return or preview.",
    "- If sourceSchema is present, only reference the listed table and column names exactly as provided there.",
    "- If sourceDataDictionary is present, use it to align terminology, joins, calculations, and column meaning with the real source semantics.",
    "- If connection$tableName is not available, do not invent one. Choose from sourceSchema tables when present; otherwise use df_input unless the user explicitly supplied a valid table/query target.",
    "- When helpful, add outputs inside result$outputs.",
    `User request: ${args.userPrompt}`,
    JSON.stringify(promptPayload, null, 2)
  ].join("\n");
}
