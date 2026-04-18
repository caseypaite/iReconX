import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/lib/auth/api";
import { executeTidyverseScript } from "@/lib/tidyverse/service";
import { getAccessibleTidyverseConnection } from "@/lib/tidyverse/data-sources";
import { studioDatasetSchema } from "@/lib/plugins/protocol";

export const dynamic = "force-dynamic";

const rConsoleExecutionRequestSchema = z.object({
  script: z.string().trim().min(1, "R console script is required."),
  dataset: studioDatasetSchema.nullable(),
  payload: z.record(z.any()).nullable().optional(),
  sourceConnectionId: z.string().trim().min(1).nullable().optional()
});

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = rConsoleExecutionRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid R console payload." }, { status: 400 });
  }

  try {
    const connection = parsed.data.sourceConnectionId
      ? await getAccessibleTidyverseConnection({
          sourceId: parsed.data.sourceConnectionId,
          userId: auth.user.sub,
          role: auth.user.role
        })
      : null;
    const result = await executeTidyverseScript({
      script: parsed.data.script,
      dataset: parsed.data.dataset ?? null,
      payload: parsed.data.payload ?? null,
      connection,
      node: {
        id: "r-console",
        label: "R Console"
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to execute the R console right now." },
      { status: 400 }
    );
  }
}
