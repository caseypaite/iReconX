import { z } from "zod";

import { pluginExecutionTargetSchema } from "@/lib/plugins/protocol";

const transformNodeKindSchema = z.enum(["source", "plugin", "tidyverse-entry", "tidyverse-script", "tidyverse-viewer", "result"]);

export const savedTransformNodeSchema = z.object({
  id: z.string().min(1),
  kind: transformNodeKindSchema,
  label: z.string().min(1),
  description: z.string(),
  x: z.number(),
  y: z.number(),
  disabled: z.boolean().optional(),
  pluginId: z.string().min(1).optional(),
  params: z.record(z.any()).optional(),
  sourceId: z.string().min(1).optional(),
  script: z.string().optional()
});

export const savedTransformEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1)
});

export const transformWorkflowDocumentSchema = z.object({
  version: z.literal(1),
  nodes: z.array(savedTransformNodeSchema),
  edges: z.array(savedTransformEdgeSchema),
  selectedSourceIds: z.array(z.string().min(1)),
  executionTarget: pluginExecutionTargetSchema,
  payloadText: z.string()
});

export type TransformWorkflowDocument = z.infer<typeof transformWorkflowDocumentSchema>;

export const SAMPLE_TIDYVERSE_WORKFLOW_ID = "sample-tidyverse-piped-preview";

export const sampleTidyverseHeadScript = [
  'if (connection$sourceKind != "persistent-import") {',
  '  stop("Choose a persistent imported table for this sample workflow before running it.")',
  "}",
  "",
  "query <- paste(",
  "  'SELECT payload::text AS payload_json',",
  "  'FROM import_archive.\"PersistentDatasetRow\"',",
  "  'WHERE \"datasetId\" = $1',",
  "  'ORDER BY \"rowIndex\" ASC',",
  "  'LIMIT 10'",
  ")",
  "raw_rows <- DBI::dbGetQuery(db, query, params = list(connection$sourceId))",
  "if (nrow(raw_rows) == 0) {",
  '  stop("The selected persistent import has no rows to preview.")',
  "}",
  "",
  "preview_rows <- lapply(raw_rows$payload_json, function(value) {",
  "  row <- jsonlite::fromJSON(value, simplifyVector = FALSE)",
  "  as.list(vapply(row, function(cell) {",
  "    if (is.null(cell) || length(cell) == 0) {",
  "      return(NA_character_)",
  "    }",
  "    as.character(cell)",
  "  }, character(1)))",
  "})",
  "preview_df <- dplyr::bind_rows(preview_rows) %>%",
  '  dplyr::mutate(.preview_row = dplyr::row_number())',
  'source_label <- if (!is.null(connection$sourceName) && nzchar(connection$sourceName)) connection$sourceName else "the selected source"',
  "result_dataset <- preview_df",
  'result <- list(summary = paste("Prepared", nrow(preview_df), "preview rows from", source_label), outputs = list(source = source_label, previewRows = nrow(preview_df)))'
].join("\n");

export const sampleTidyverseWorkflow = {
  id: SAMPLE_TIDYVERSE_WORKFLOW_ID,
  name: "Tidyverse piped preview sample",
  description: "Choose a persistent import, then use a dplyr pipe flow to fetch and number the first 10 stored rows for preview.",
  definition: {
    version: 1,
    executionTarget: "server",
    payloadText: "{}",
    selectedSourceIds: [],
    nodes: [
      {
        id: "source",
        kind: "source",
        label: "Source",
        description: "Current Data Studio dataset and shared workflow input.",
        x: 48,
        y: 140
      },
      {
        id: "tidyverse-entry-sample",
        kind: "tidyverse-entry",
        label: "Preview source binding",
        description: "Pick up the Source node connection and forward it into the tidyverse runtime.",
        x: 270,
        y: 128
      },
      {
        id: "tidyverse-script-sample",
        kind: "tidyverse-script",
        label: "Pipe preview rows",
        description: "Use a dplyr pipe to fetch, number, and return the first 10 rows from the selected persistent import.",
        script: sampleTidyverseHeadScript,
        params: {},
        x: 512,
        y: 128
      },
      {
        id: "result",
        kind: "result",
        label: "Result",
        description: "Publish final dataset back.",
        x: 860,
        y: 140
      }
    ],
    edges: [
      {
        id: "source-tidyverse-entry-sample",
        from: "source",
        to: "tidyverse-entry-sample"
      },
      {
        id: "tidyverse-entry-sample-tidyverse-script-sample",
        from: "tidyverse-entry-sample",
        to: "tidyverse-script-sample"
      },
      {
        id: "tidyverse-script-sample-result",
        from: "tidyverse-script-sample",
        to: "result"
      }
    ]
  } satisfies TransformWorkflowDocument
};
