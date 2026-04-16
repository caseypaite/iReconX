import { NextRequest, NextResponse } from "next/server";

import { requestPluginGeneration } from "@/lib/ai/providers";
import { requireApiSession } from "@/lib/auth/api";
import {
  assertValidPluginSourceCode,
  buildPluginGenerationPrompt,
  generatedPluginDraftSchema,
  pluginGenerationRequestSchema
} from "@/lib/plugins/protocol";

export const dynamic = "force-dynamic";

function extractJsonBlock(content: string) {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
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
  const parsed = pluginGenerationRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid generation payload." }, { status: 400 });
  }

  const protocolPrompt = buildPluginGenerationPrompt({
    runtime: parsed.data.runtime,
    userPrompt: parsed.data.userPrompt,
    dataset: parsed.data.dataset ?? null,
    payload: parsed.data.payload ?? null
  });

  try {
    const response = await requestPluginGeneration({
      provider: parsed.data.provider,
      userId: auth.user.sub,
      role: auth.user.role,
      systemPrompt: protocolPrompt,
      userPrompt: parsed.data.userPrompt
    });
    const jsonText = extractJsonBlock(response.content);
    const draft = generatedPluginDraftSchema.parse(JSON.parse(jsonText));
    assertValidPluginSourceCode(draft.sourceCode);

    return NextResponse.json({
      draft,
      provider: parsed.data.provider,
      providerModel: response.model,
      generationPrompt: protocolPrompt
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate a plugin right now." },
      { status: 400 }
    );
  }
}
