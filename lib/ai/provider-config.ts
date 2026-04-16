import type { PluginProviderId } from "@/lib/plugins/protocol";

export const aiProviderOrder = ["copilot", "gemini", "mistral"] as const satisfies readonly PluginProviderId[];

export type AiProviderSource = "account" | "legacy-admin" | "default";

export type AiProviderFormValue = {
  endpoint: string;
  model: string;
  apiKey: string;
  source: AiProviderSource;
  updatedAt: string | null;
};

export type AiProviderFormMap = Record<PluginProviderId, AiProviderFormValue>;

export const aiProviderCatalog: Record<
  PluginProviderId,
  {
    label: string;
    description: string;
    endpointPlaceholder: string;
    modelPlaceholder: string;
    defaultEndpoint: string;
    defaultModel: string;
    headers?: Record<string, string>;
  }
> = {
  copilot: {
    label: "GitHub Copilot / Models",
    description: "Use your personal GitHub Models credentials when generating plugins for your own workspace.",
    endpointPlaceholder: "https://models.github.ai/inference/chat/completions",
    modelPlaceholder: "openai/gpt-4.1",
    defaultEndpoint: "https://models.github.ai/inference/chat/completions",
    defaultModel: "openai/gpt-4.1",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  },
  gemini: {
    label: "Gemini",
    description: "Connect a Google AI Studio or Gemini-compatible credential that only applies to your user account.",
    endpointPlaceholder: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    modelPlaceholder: "gemini-2.5-flash",
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    defaultModel: "gemini-2.5-flash"
  },
  mistral: {
    label: "Mistral",
    description: "Store a personal Mistral key for plugin generation without exposing it to other users.",
    endpointPlaceholder: "https://api.mistral.ai/v1/chat/completions",
    modelPlaceholder: "mistral-large-latest",
    defaultEndpoint: "https://api.mistral.ai/v1/chat/completions",
    defaultModel: "mistral-large-latest"
  }
};
