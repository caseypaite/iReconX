import { z } from "zod";

const githubCatalogModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  publisher: z.string().min(1).optional(),
  summary: z.string().optional(),
  supported_output_modalities: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  capabilities: z.array(z.string()).optional()
});

const githubCatalogResponseSchema = z.union([
  z.array(githubCatalogModelSchema),
  z.object({
    models: z.array(githubCatalogModelSchema)
  })
]);

export type GitHubCatalogModel = {
  id: string;
  name: string;
  publisher: string;
  summary: string;
};

const codingKeywordPattern =
  /\b(coding|code|codebase|programming|developer|software engineering|fill-in-the-middle|completion|vibe coding)\b/i;

function isCodingModel(model: z.infer<typeof githubCatalogModelSchema>) {
  const searchableText = [model.id, model.name, model.publisher, model.summary].filter(Boolean).join(" ");
  const capabilities = (model.capabilities ?? []).map((entry) => entry.toLowerCase());
  const tags = (model.tags ?? []).map((entry) => entry.toLowerCase());
  const outputs = (model.supported_output_modalities ?? []).map((entry) => entry.toLowerCase());

  const supportsTextOutput = outputs.length === 0 || outputs.includes("text");
  const hasCodingSignals =
    codingKeywordPattern.test(searchableText) ||
    tags.some((tag) => tag.includes("code") || tag.includes("coding")) ||
    capabilities.some((capability) =>
      ["tool-calling", "reasoning", "agents", "agentsv2", "fill-in-the-middle"].includes(capability)
    );

  return supportsTextOutput && hasCodingSignals;
}

export function buildGitHubCatalogEndpoint(inferenceEndpoint: string) {
  const url = new URL(inferenceEndpoint || "https://models.github.ai/inference/chat/completions");
  url.pathname = "/catalog/models";
  url.search = "";
  return url.toString();
}

export async function fetchGitHubCatalogModels(args: {
  apiKey: string;
  inferenceEndpoint: string;
  headers?: Record<string, string>;
}) {
  const response = await fetch(buildGitHubCatalogEndpoint(args.inferenceEndpoint), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      ...(args.headers ?? {})
    },
    cache: "no-store"
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error === "object" && "message" in payload.error && typeof payload.error.message === "string"
          ? payload.error.message
          : "Unable to load available GitHub Models.";
    throw new Error(errorMessage);
  }

  const parsed = githubCatalogResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error("GitHub Models returned an unexpected catalog response.");
  }

  const models = Array.isArray(parsed.data) ? parsed.data : parsed.data.models;

  return models
    .filter(isCodingModel)
    .map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      publisher: model.publisher ?? "",
      summary: model.summary ?? ""
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}
