import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/lib/auth/api";
import { executePluginChain, executePluginGraph } from "@/lib/plugins/execution";
import { getAccessiblePluginsByIds } from "@/lib/plugins/catalog";
import { pluginExecutionTargetSchema, studioDatasetSchema } from "@/lib/plugins/protocol";
import { runPluginOnServer } from "@/lib/plugins/server-runtime";

export const dynamic = "force-dynamic";

const pluginRunRequestSchema = z.object({
  executionTarget: pluginExecutionTargetSchema,
  dataset: studioDatasetSchema.nullable(),
  payload: z.record(z.any()).nullable().optional(),
  steps: z
    .array(
      z.object({
        pluginId: z.string().min(1),
        params: z.record(z.any()).optional()
      })
    )
    .optional(),
  graphSteps: z
    .array(
      z.object({
        nodeId: z.string().min(1),
        pluginId: z.string().min(1),
        parentNodeId: z.string().min(1),
        params: z.record(z.any()).optional()
      })
    )
    .optional(),
  resultParentNodeId: z.string().min(1).nullable().optional()
});

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = pluginRunRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid plugin run payload." }, { status: 400 });
  }

  if (parsed.data.executionTarget !== "server") {
    return NextResponse.json({ error: "This endpoint only supports server execution." }, { status: 400 });
  }

  const pluginIds = Array.from(
    new Set([...(parsed.data.steps ?? []).map((step) => step.pluginId), ...(parsed.data.graphSteps ?? []).map((step) => step.pluginId)])
  );
  const definitions = await getAccessiblePluginsByIds(auth.user.sub, auth.user.role, pluginIds);

  try {
    const execution = parsed.data.graphSteps
      ? await executePluginGraph({
          definitions,
          initialDataset: parsed.data.dataset,
          payload: parsed.data.payload ?? null,
          executionTarget: "server",
          steps: parsed.data.graphSteps,
          resultParentNodeId: parsed.data.resultParentNodeId ?? null,
          runPlugin: runPluginOnServer
        })
      : await executePluginChain({
          definitions,
          initialDataset: parsed.data.dataset,
          payload: parsed.data.payload ?? null,
          executionTarget: "server",
          steps: parsed.data.steps ?? [],
          runPlugin: runPluginOnServer
        });

    return NextResponse.json(execution);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to execute the plugin chain." },
      { status: 400 }
    );
  }
}
