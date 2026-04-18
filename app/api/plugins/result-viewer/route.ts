import { NextRequest, NextResponse } from "next/server";

import { requestAiCompletion } from "@/lib/ai/providers";
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrapPreviewCandidate(candidate: unknown): unknown {
  if (Array.isArray(candidate)) {
    return candidate.find(isPlainObject) ?? candidate[0] ?? candidate;
  }

  if (!isPlainObject(candidate)) {
    return candidate;
  }

  if ("preview" in candidate) {
    return unwrapPreviewCandidate(candidate.preview);
  }

  if ("result" in candidate && isPlainObject(candidate.result) && "preview" in candidate.result) {
    return unwrapPreviewCandidate(candidate.result.preview);
  }

  return candidate;
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

  const settings = await loadUserAiSettings(auth.user.sub, auth.user.role);
  const provider = settings.defaultProvider;

  if (!settings.providers[provider].apiKey.trim()) {
    return NextResponse.json(
      {
        error: `Configure an API key for your default AI provider (${provider}) in User Configuration before generating a result preview.`
      },
      { status: 400 }
    );
  }

  try {
    const response = await requestAiCompletion({
      provider,
      userId: auth.user.sub,
      role: auth.user.role,
      systemPrompt:
        "You create structured metadata-only chart recommendations for iReconX Transform Studio result viewing. Return only valid JSON and never include raw result rows or full output payloads.",
      userPrompt: buildResultViewerPrompt({
        nodeLabel: parsed.data.nodeLabel,
        result: parsed.data.result
      }),
      temperature: 0.1
    });
    const extractedContent = JSON.parse(extractJsonBlock(response.content));
    const fallbackPreview = {
      title: `${parsed.data.nodeLabel} preview`,
      summary: parsed.data.result.summary,
      preferredView: "table" as const,
      table: {
        columns: [],
        rows: []
      },
      visual: null
    };
    const previewCandidate = unwrapPreviewCandidate(extractedContent);
    const parsedPreview = resultViewerPreviewSchema.safeParse(previewCandidate);
    const preview = withResultViewerFallback(
      parsedPreview.success ? parsedPreview.data : fallbackPreview,
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
