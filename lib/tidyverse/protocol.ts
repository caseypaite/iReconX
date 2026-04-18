import { z } from "zod";

import { pluginExecutionResultSchema, studioDatasetSchema } from "@/lib/plugins/protocol";
import { sourceConnectionSchema } from "@/lib/source-connection";

export const tidyverseConnectionSchema = sourceConnectionSchema;

export type TidyverseConnection = z.infer<typeof tidyverseConnectionSchema>;

export const tidyverseExecutionRequestSchema = z.object({
  script: z.string().trim().min(1, "Tidyverse script is required."),
  dataset: studioDatasetSchema.nullable(),
  payload: z.record(z.any()).nullable().optional(),
  params: z.record(z.any()).optional(),
  upstream: z.array(pluginExecutionResultSchema).optional(),
  connection: tidyverseConnectionSchema.nullable().optional(),
  node: z.object({
    id: z.string().min(1),
    label: z.string().min(1)
  })
});

export type TidyverseExecutionRequest = z.infer<typeof tidyverseExecutionRequestSchema>;
