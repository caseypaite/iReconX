import { promises as fs } from "fs";
import path from "path";

import { AuditAction, Prisma, SettingCategory } from "@prisma/client";

import {
  adminSettingDefinitions,
  adminSettingKeys,
  adminSettingsSchema,
  type AdminSettingField,
  type AdminSettingKey,
  type AdminSettingValueMap
} from "@/lib/admin/settings-config";
import { decryptJson, encryptJson, getEffectiveEncryptionSecret } from "@/lib/security/secrets";
import { prisma } from "@/lib/prisma";

type AppSettingRecord = {
  key: string;
  value: string;
  updatedAt: Date;
  updatedBy: {
    email: string;
  } | null;
};

function toSettingCategory(category: AdminSettingField["category"]) {
  return category as SettingCategory;
}

function getDefinitionMap() {
  return new Map(adminSettingDefinitions.map((definition) => [definition.key, definition]));
}

function buildValueMap(fields: AdminSettingField[]) {
  return fields.reduce<AdminSettingValueMap>(
    (values, field) => ({
      ...values,
      [field.key]: field.value
    }),
    {} as AdminSettingValueMap
  );
}

function quoteEnvValue(value: string) {
  return JSON.stringify(value);
}

function getEnvFilePath() {
  const configuredPath = process.env.IRECONX_ENV_FILE?.trim();

  if (!configuredPath) {
    return path.join(process.cwd(), ".env");
  }

  return path.isAbsolute(configuredPath) ? configuredPath : path.join(process.cwd(), configuredPath);
}

function renderEnvFile(nextValues: AdminSettingValueMap, currentContent: string | null) {
  const existingLines = currentContent?.split(/\r?\n/) ?? [];
  const handledKeys = new Set<string>();

  const nextLines = existingLines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);

    if (!match) {
      return line;
    }

    const [, key] = match;

    if (!adminSettingKeys.includes(key as AdminSettingKey)) {
      return line;
    }

    handledKeys.add(key);
    return `${key}=${quoteEnvValue(nextValues[key as AdminSettingKey])}`;
  });

  for (const key of adminSettingKeys) {
    if (!handledKeys.has(key)) {
      nextLines.push(`${key}=${quoteEnvValue(nextValues[key])}`);
    }
  }

  return `${nextLines.filter((line, index, lines) => !(index === lines.length - 1 && line === "")).join("\n")}\n`;
}

async function readEnvFile() {
  const envPath = getEnvFilePath();

  try {
    return {
      path: envPath,
      content: await fs.readFile(envPath, "utf8")
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {
        path: envPath,
        content: null
      };
    }

    throw error;
  }
}

async function restoreEnvFile(envPath: string, content: string | null) {
  if (content === null) {
    await fs.rm(envPath, { force: true });
    return;
  }

  await fs.mkdir(path.dirname(envPath), { recursive: true });
  await fs.writeFile(envPath, content, "utf8");
}

export async function loadAdminSettings(): Promise<AdminSettingField[]> {
  const storedSettings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: adminSettingKeys
      }
    },
    include: {
      updatedBy: {
        select: {
          email: true
        }
      }
    }
  });

  const byKey = new Map<string, AppSettingRecord>(
    storedSettings.map((setting) => [
      setting.key,
      {
        key: setting.key,
        value: setting.value,
        updatedAt: setting.updatedAt,
        updatedBy: setting.updatedBy
      }
    ])
  );

  return adminSettingDefinitions.map((definition) => {
    const storedSetting = byKey.get(definition.key);
    const envValue = process.env[definition.key];
    const value = storedSetting?.value ?? envValue ?? "";

    return {
      ...definition,
      value,
      source: storedSetting ? "database" : envValue !== undefined ? "environment" : "default",
      updatedAt: storedSetting?.updatedAt.toISOString() ?? null,
      updatedByEmail: storedSetting?.updatedBy?.email ?? null
    };
  });
}

function getChangedKeys(currentValues: AdminSettingValueMap, nextValues: AdminSettingValueMap) {
  return adminSettingKeys.filter((key) => currentValues[key] !== nextValues[key]);
}

export async function updateAdminSettings(values: unknown, actorId: string) {
  const parsed = adminSettingsSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid settings payload."
    };
  }

  const nextValues = parsed.data;
  const currentFields = await loadAdminSettings();
  const currentValues = buildValueMap(currentFields);
  const changedKeys = getChangedKeys(currentValues, nextValues);

  if (changedKeys.length === 0) {
    return {
      ok: true as const,
      fields: currentFields
    };
  }

  const currentEffectiveEncryptionSecret = getEffectiveEncryptionSecret(
    currentValues.ENCRYPTION_SECRET,
    currentValues.JWT_SECRET
  );
  const nextEffectiveEncryptionSecret = getEffectiveEncryptionSecret(nextValues.ENCRYPTION_SECRET, nextValues.JWT_SECRET);
  const shouldReencryptDataSources = currentEffectiveEncryptionSecret !== nextEffectiveEncryptionSecret;
  const envFile = await readEnvFile();
  const nextEnvContent = renderEnvFile(nextValues, envFile.content);

  await fs.mkdir(path.dirname(envFile.path), { recursive: true });
  await fs.writeFile(envFile.path, nextEnvContent, "utf8");

  try {
    const definitionMap = getDefinitionMap();

    await prisma.$transaction(async (tx) => {
      if (shouldReencryptDataSources) {
        const dataSources = await tx.dataSource.findMany({
          select: {
            id: true,
            configCiphertext: true
          }
        });

        for (const dataSource of dataSources) {
          const config = decryptJson<Record<string, unknown>>(dataSource.configCiphertext, currentEffectiveEncryptionSecret);

          await tx.dataSource.update({
            where: {
              id: dataSource.id
            },
            data: {
              configCiphertext: encryptJson(config, nextEffectiveEncryptionSecret)
            }
          });
        }
      }

      for (const key of adminSettingKeys) {
        const definition = definitionMap.get(key);

        if (!definition) {
          continue;
        }

        await tx.appSetting.upsert({
          where: {
            key
          },
          create: {
            key,
            category: toSettingCategory(definition.category),
            value: nextValues[key],
            isSecret: definition.isSecret,
            updatedById: actorId
          },
          update: {
            category: toSettingCategory(definition.category),
            value: nextValues[key],
            isSecret: definition.isSecret,
            updatedById: actorId
          }
        });
      }

      await tx.auditLog.create({
        data: {
          action: AuditAction.SETTINGS_UPDATED,
          actorId,
          entityType: "AppSetting",
          metadata: {
            keys: changedKeys,
            categories: [
              ...new Set(
                changedKeys
                  .map((key) => definitionMap.get(key)?.category)
                  .filter((category): category is NonNullable<typeof category> => Boolean(category))
              )
            ],
            reencryptedDataSources: shouldReencryptDataSources
          } as Prisma.InputJsonValue
        }
      });
    });
  } catch (error) {
    await restoreEnvFile(envFile.path, envFile.content);
    throw error;
  }

  for (const key of adminSettingKeys) {
    process.env[key] = nextValues[key];
  }

  return {
    ok: true as const,
    fields: await loadAdminSettings()
  };
}
