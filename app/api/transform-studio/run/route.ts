import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/lib/auth/api";
import { getAccessiblePluginsByIds } from "@/lib/plugins/catalog";
import { pluginExecutionTargetSchema, studioDatasetSchema } from "@/lib/plugins/protocol";
import { executeTransformWorkflowGraph } from "@/lib/transform-studio/execution";
import { transformWorkflowStepSchema } from "@/lib/transform-studio/protocol";

export const dynamic = "force-dynamic";

const transformRunRequestSchema = z.object({
  executionTarget: pluginExecutionTargetSchema,
  dataset: studioDatasetSchema.nullable().optional(),
  payload: z.record(z.any()).nullable().optional(),
  sourceConnectionId: z.string().min(1).nullable().optional(),
  graphSteps: z.array(transformWorkflowStepSchema),
  resultParentNodeId: z.string().min(1).nullable().optional()
});

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = transformRunRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid transform workflow payload." },
      { status: 400 }
    );
  }

  if (parsed.data.executionTarget !== "server") {
    return NextResponse.json({ error: "Transform workflow execution currently runs on the server only." }, { status: 400 });
  }

  const pluginIds = Array.from(
    new Set(
      parsed.data.graphSteps
        .filter((step): step is Extract<typeof step, { kind: "plugin" }> => step.kind === "plugin")
        .map((step) => step.pluginId)
    )
  );
  const definitions = await getAccessiblePluginsByIds(auth.user.sub, auth.user.role, pluginIds);

  try {
    const execution = await executeTransformWorkflowGraph({
      definitions,
      initialDataset: parsed.data.dataset ?? null,
      payload: parsed.data.payload ?? null,
      sourceConnectionId: parsed.data.sourceConnectionId ?? null,
      executionTarget: "server",
      steps: parsed.data.graphSteps,
      resultParentNodeId: parsed.data.resultParentNodeId ?? null,
      user: auth.user
    });

    return NextResponse.json(execution);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to execute the transform workflow." },
      { status: 400 }
    );
  }
}
