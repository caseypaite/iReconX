import { z } from "zod";

export const transformWorkflowStepSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("plugin"),
    nodeId: z.string().min(1),
    parentNodeId: z.string().min(1),
    pluginId: z.string().min(1),
    label: z.string().min(1),
    params: z.record(z.any()).optional()
  }),
  z.object({
    kind: z.literal("tidyverse-entry"),
    nodeId: z.string().min(1),
    parentNodeId: z.string().min(1),
    label: z.string().min(1)
  }),
  z.object({
    kind: z.literal("tidyverse-script"),
    nodeId: z.string().min(1),
    parentNodeId: z.string().min(1),
    label: z.string().min(1),
    script: z.string().trim().min(1),
    params: z.record(z.any()).optional()
  })
]);

export type TransformWorkflowStep = z.infer<typeof transformWorkflowStepSchema>;

export function workflowNeedsServerExecution(steps: TransformWorkflowStep[]) {
  return steps.some((step) => step.kind !== "plugin");
}
