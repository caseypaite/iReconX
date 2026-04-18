import { NextRequest, NextResponse } from "next/server";

import { requestAiCompletion } from "@/lib/ai/providers";
import { getDefaultUserAiProvider } from "@/lib/ai/user-settings";
import { requireApiSession } from "@/lib/auth/api";
import { sanitizeSourceConnection } from "@/lib/source-connection";
import { getAccessibleTidyverseConnection, getAccessibleTidyverseSourceDictionary } from "@/lib/tidyverse/data-sources";
import { introspectTidyverseSourceSchema } from "@/lib/tidyverse/schema-introspection";
import {
  buildRConsoleGenerationPrompt,
  generatedRConsoleScriptSchema,
  rConsoleGenerationRequestSchema
} from "@/lib/transform-studio/r-console-ai";

export const dynamic = "force-dynamic";

function extractJsonBlock(content: string) {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return content.trim();
}

function extractScriptBlock(content: string) {
  const fencedMatch = content.match(/```(?:r)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return content.trim();
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = rConsoleGenerationRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid tidyverse generation payload." }, { status: 400 });
  }

  try {
    const provider = parsed.data.provider ?? (await getDefaultUserAiProvider(auth.user.sub, auth.user.role));
    const connection = parsed.data.sourceConnectionId
      ? await getAccessibleTidyverseConnection({
          sourceId: parsed.data.sourceConnectionId,
          userId: auth.user.sub,
          role: auth.user.role
        })
      : null;
    const sourceSchema = parsed.data.sourceSchema ?? (connection ? await introspectTidyverseSourceSchema(connection) : null);
    const sourceDataDictionary =
      parsed.data.sourceDataDictionary ??
      (parsed.data.sourceConnectionId
        ? await getAccessibleTidyverseSourceDictionary({
            sourceId: parsed.data.sourceConnectionId,
            userId: auth.user.sub,
            role: auth.user.role
          })
        : null);
    const generationPrompt = buildRConsoleGenerationPrompt({
      userPrompt: parsed.data.userPrompt,
      dataset: parsed.data.dataset ?? null,
      payload: parsed.data.payload ?? null,
      connection: sanitizeSourceConnection(connection),
      sourceSchema,
      sourceDataDictionary,
      currentScript: parsed.data.currentScript
    });
    const response = await requestAiCompletion({
      provider,
      userId: auth.user.sub,
      role: auth.user.role,
      systemPrompt: generationPrompt,
      userPrompt: parsed.data.userPrompt
    });

    let draft = null;

    try {
      draft = generatedRConsoleScriptSchema.parse(JSON.parse(extractJsonBlock(response.content)));
    } catch {
      draft = generatedRConsoleScriptSchema.parse({
        script: extractScriptBlock(response.content)
      });
    }

    return NextResponse.json({
      script: draft.script,
      provider,
      providerModel: response.model,
      generationPrompt
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate tidyverse code right now." },
      { status: 400 }
    );
  }
}
