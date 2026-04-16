import { getUserAiProviderConfig } from "@/lib/ai/user-settings";
import type { PluginProviderId } from "@/lib/plugins/protocol";
import type { AppRole } from "@/types/auth";

function extractMessageContent(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) =>
        entry && typeof entry === "object" && "text" in entry && typeof entry.text === "string" ? entry.text : ""
      )
      .join("");
  }

  return "";
}

export async function requestAiCompletion(args: {
  provider: PluginProviderId;
  userId: string;
  role: AppRole;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}) {
  const config = await getUserAiProviderConfig(args.provider, args.userId, args.role);

  if (!config.apiKey) {
    throw new Error(`The ${args.provider} provider is not configured yet.`);
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(config.headers ?? {})
    },
    body: JSON.stringify({
      model: config.model,
      temperature: args.temperature ?? 0.2,
      messages: [
        {
          role: "system",
          content: args.systemPrompt
        },
        {
          role: "user",
          content: args.userPrompt
        }
      ]
    }),
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: {
          message?: string;
        };
        choices?: Array<{
          message?: {
            content?: unknown;
          };
        }>;
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "AI provider request failed.");
  }

  const content = extractMessageContent(payload?.choices?.[0]?.message?.content);

  if (!content) {
    throw new Error("AI provider returned an empty plugin draft.");
  }

  return {
    model: config.model,
    content
  };
}

export async function requestPluginGeneration(args: {
  provider: PluginProviderId;
  userId: string;
  role: AppRole;
  systemPrompt: string;
  userPrompt: string;
}) {
  return requestAiCompletion(args);
}
