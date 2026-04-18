import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/lib/auth/api";
import { fetchGitHubCatalogModels } from "@/lib/ai/github-models";
import { getUserAiProviderConfig } from "@/lib/ai/user-settings";
import { pluginProviderSchema } from "@/lib/plugins/protocol";

export const dynamic = "force-dynamic";

const modelCatalogRequestSchema = z.object({
  provider: pluginProviderSchema,
  endpoint: z.string().optional(),
  apiKey: z.string().optional()
});

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = modelCatalogRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid model catalog request." }, { status: 400 });
  }

  if (parsed.data.provider !== "copilot") {
    return NextResponse.json({ error: "Live model catalog is only supported for GitHub Models." }, { status: 400 });
  }

  const config = await getUserAiProviderConfig(parsed.data.provider, auth.user.sub, auth.user.role);
  const apiKey = parsed.data.apiKey?.trim() || config.apiKey.trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: "Enter or save a GitHub Models API key before loading available models." },
      { status: 400 }
    );
  }

  try {
    const models = await fetchGitHubCatalogModels({
      apiKey,
      inferenceEndpoint: parsed.data.endpoint?.trim() || config.endpoint,
      headers: config.headers
    });

    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load available GitHub Models." },
      { status: 400 }
    );
  }
}
