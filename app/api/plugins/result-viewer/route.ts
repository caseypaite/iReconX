import { NextRequest, NextResponse } from "next/server";

import { requestAiCompletion } from "@/lib/ai/providers";
import { aiProviderOrder } from "@/lib/ai/provider-config";
import { buildResultViewerPrompt, resultViewerPreviewSchema, resultViewerRequestSchema, withResultViewerFallback } from "@/lib/ai/result-viewer";
import { loadUserAiSettings } from "@/lib/ai/user-settings";
import { requireApiSession } from "@/lib/auth/api";

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
  const parsed = resultViewerRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid result viewer payload." }, { status: 400 });
  }

  const providerSettings = await loadUserAiSettings(auth.user.sub, auth.user.role);
  const provider = aiProviderOrder.find((candidate) => providerSettings[candidate].apiKey.trim().length > 0);

  if (!provider) {
    return NextResponse.json(
      { error: "Configure at least one personal AI provider key in User Configuration before generating a result preview." },
      { status: 400 }
    );
  }

  try {
    const response = await requestAiCompletion({
      provider,
      userId: auth.user.sub,
      role: auth.user.role,
      systemPrompt: "You create structured preview specs for iReconX Transform Studio result viewing. Return only valid JSON.",
      userPrompt: buildResultViewerPrompt({
        nodeLabel: parsed.data.nodeLabel,
        result: parsed.data.result
      }),
      temperature: 0.1
    });
    const preview = withResultViewerFallback(
      resultViewerPreviewSchema.parse(JSON.parse(extractJsonBlock(response.content))),
      parsed.data.result,
      parsed.data.nodeLabel
    );

    return NextResponse.json({
      preview,
      provider,
      model: response.model
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate a result preview right now." },
      { status: 400 }
    );
  }
}
