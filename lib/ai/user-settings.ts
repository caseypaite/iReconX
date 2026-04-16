import { z } from "zod";

import { aiProviderCatalog, aiProviderOrder, type AiProviderFormMap } from "@/lib/ai/provider-config";
import { prisma } from "@/lib/prisma";
import { decryptJson, encryptJson } from "@/lib/security/secrets";
import type { PluginProviderId } from "@/lib/plugins/protocol";
import type { AppRole } from "@/types/auth";

type ProviderConfig = {
  endpoint: string;
  model: string;
  apiKey: string;
  headers?: Record<string, string>;
};

const providerSettingSchema = z.object({
  endpoint: z.union([z.literal(""), z.string().url("Provider endpoint must be a valid URL.")]),
  model: z.string(),
  apiKey: z.string(),
  source: z.enum(["account", "legacy-admin", "default"]).default("default"),
  updatedAt: z.string().nullable().default(null)
});

const aiSettingsSchema = z.object({
  copilot: providerSettingSchema,
  gemini: providerSettingSchema,
  mistral: providerSettingSchema
});

const legacyCopilotKeys: string[] = ["AI_COPILOT_ENDPOINT", "AI_COPILOT_MODEL", "AI_COPILOT_API_KEY"];

function decryptApiKey(ciphertext: string | null) {
  if (!ciphertext) {
    return "";
  }

  const payload = decryptJson<{ apiKey?: string }>(ciphertext);
  return payload.apiKey?.trim() ?? "";
}

async function loadLegacyAdminCopilotSettings() {
  const storedSettings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: legacyCopilotKeys
      }
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  const byKey = new Map(storedSettings.map((setting) => [setting.key, setting.value]));
  const latestUpdatedAt = storedSettings[0]?.updatedAt.toISOString() ?? null;

  return {
    endpoint: byKey.get("AI_COPILOT_ENDPOINT")?.trim() ?? process.env.AI_COPILOT_ENDPOINT?.trim() ?? "",
    model: byKey.get("AI_COPILOT_MODEL")?.trim() ?? process.env.AI_COPILOT_MODEL?.trim() ?? "",
    apiKey: byKey.get("AI_COPILOT_API_KEY")?.trim() ?? process.env.AI_COPILOT_API_KEY?.trim() ?? "",
    updatedAt: latestUpdatedAt
  };
}

export async function loadUserAiSettings(userId: string, role: AppRole): Promise<AiProviderFormMap> {
  const storedSettings = await prisma.userAiProviderSetting.findMany({
    where: {
      userId
    }
  });

  const byProvider = new Map(storedSettings.map((setting) => [setting.provider, setting]));
  const legacyCopilotSettings = role === "ADMIN" ? await loadLegacyAdminCopilotSettings() : null;

  return aiProviderOrder.reduce<AiProviderFormMap>((settings, provider) => {
    const storedSetting = byProvider.get(provider);

    if (storedSetting) {
      settings[provider] = {
        endpoint: storedSetting.endpoint,
        model: storedSetting.model,
        apiKey: decryptApiKey(storedSetting.apiKeyCiphertext),
        source: "account",
        updatedAt: storedSetting.updatedAt.toISOString()
      };
      return settings;
    }

    if (
      provider === "copilot" &&
      legacyCopilotSettings &&
      (legacyCopilotSettings.endpoint || legacyCopilotSettings.model || legacyCopilotSettings.apiKey)
    ) {
      settings[provider] = {
        endpoint: legacyCopilotSettings.endpoint,
        model: legacyCopilotSettings.model,
        apiKey: legacyCopilotSettings.apiKey,
        source: "legacy-admin",
        updatedAt: legacyCopilotSettings.updatedAt
      };
      return settings;
    }

    settings[provider] = {
      endpoint: "",
      model: "",
      apiKey: "",
      source: "default",
      updatedAt: null
    };
    return settings;
  }, {} as AiProviderFormMap);
}

export async function updateUserAiSettings(values: unknown, userId: string, role: AppRole) {
  const parsed = aiSettingsSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid AI settings payload."
    };
  }

  await prisma.$transaction(async (tx) => {
    for (const provider of aiProviderOrder) {
      const config = parsed.data[provider];

      await tx.userAiProviderSetting.upsert({
        where: {
          userId_provider: {
            userId,
            provider
          }
        },
        create: {
          userId,
          provider,
          endpoint: config.endpoint.trim(),
          model: config.model.trim(),
          apiKeyCiphertext: config.apiKey.trim()
            ? encryptJson({
                apiKey: config.apiKey.trim()
              })
            : null
        },
        update: {
          endpoint: config.endpoint.trim(),
          model: config.model.trim(),
          apiKeyCiphertext: config.apiKey.trim()
            ? encryptJson({
                apiKey: config.apiKey.trim()
              })
            : null
        }
      });
    }
  });

  return {
    ok: true as const,
    providers: await loadUserAiSettings(userId, role)
  };
}

export async function getUserAiProviderConfig(
  provider: PluginProviderId,
  userId: string,
  role: AppRole
): Promise<ProviderConfig> {
  const settings = await loadUserAiSettings(userId, role);
  const config = settings[provider];
  const defaults = aiProviderCatalog[provider];

  return {
    endpoint: config.endpoint || defaults.defaultEndpoint,
    model: config.model || defaults.defaultModel,
    apiKey: config.apiKey,
    headers: defaults.headers
  };
}
