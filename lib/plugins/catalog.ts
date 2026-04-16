import { PluginRuntime, PluginScope, type Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import type { AppRole } from "@/types/auth";
import {
  PLUGIN_PROTOCOL_VERSION,
  assertValidPluginSourceCode,
  pluginDefinitionPayloadSchema,
  pluginScopeSchema,
  type PluginDefinitionPayload,
  type PluginDefinitionRecord,
  type PluginProviderId,
  type PluginRuntimeValue,
  type PluginScopeValue
} from "@/lib/plugins/protocol";

const pluginIdSchema = z.string().min(1);

function toPluginScope(scope: PluginScopeValue) {
  return scope === "shared" ? PluginScope.SHARED : PluginScope.PERSONAL;
}

function toPluginRuntime(runtime: PluginRuntimeValue) {
  if (runtime === "browser") {
    return PluginRuntime.BROWSER;
  }

  if (runtime === "server") {
    return PluginRuntime.SERVER;
  }

  return PluginRuntime.BOTH;
}

function fromPluginScope(scope: PluginScope): PluginScopeValue {
  return scope === PluginScope.SHARED ? "shared" : "personal";
}

function fromPluginRuntime(runtime: PluginRuntime): PluginRuntimeValue {
  if (runtime === PluginRuntime.BROWSER) {
    return "browser";
  }

  if (runtime === PluginRuntime.SERVER) {
    return "server";
  }

  return "both";
}

export function serializePluginDefinition(plugin: {
  id: string;
  name: string;
  description: string | null;
  sourceCode: string;
  protocolVersion: string;
  generationPrompt: string | null;
  provider: string | null;
  providerModel: string | null;
  scope: PluginScope;
  runtime: PluginRuntime;
  ownerId: string | null;
  owner: {
    name: string | null;
    email: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}): PluginDefinitionRecord {
  return {
    id: plugin.id,
    name: plugin.name,
    description: plugin.description ?? "",
    sourceCode: plugin.sourceCode,
    protocolVersion: plugin.protocolVersion,
    generationPrompt: plugin.generationPrompt ?? "",
    provider: (plugin.provider as PluginProviderId | null) ?? null,
    providerModel: plugin.providerModel ?? "",
    scope: fromPluginScope(plugin.scope),
    runtime: fromPluginRuntime(plugin.runtime),
    ownerId: plugin.ownerId,
    ownerLabel: plugin.owner?.name?.trim() || plugin.owner?.email || "Shared system plugin",
    createdAt: plugin.createdAt.toISOString(),
    updatedAt: plugin.updatedAt.toISOString()
  };
}

export async function listAccessiblePlugins(userId: string, role: AppRole) {
  const plugins = await prisma.pluginDefinition.findMany({
    where: {
      OR: [
        {
          scope: PluginScope.SHARED
        },
        {
          ownerId: userId
        }
      ]
    },
    orderBy: [{ scope: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      sourceCode: true,
      protocolVersion: true,
      generationPrompt: true,
      provider: true,
      providerModel: true,
      scope: true,
      runtime: true,
      ownerId: true,
      owner: {
        select: {
          name: true,
          email: true
        }
      },
      createdAt: true,
      updatedAt: true
    }
  });

  return plugins
    .filter((plugin) => plugin.scope === PluginScope.SHARED || role === "ADMIN" || plugin.ownerId === userId)
    .map(serializePluginDefinition);
}

export async function getAccessiblePluginsByIds(userId: string, role: AppRole, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }

  const plugins = await prisma.pluginDefinition.findMany({
    where: {
      id: {
        in: ids
      },
      OR: [
        { scope: PluginScope.SHARED },
        { ownerId: userId }
      ]
    },
    select: {
      id: true,
      name: true,
      description: true,
      sourceCode: true,
      protocolVersion: true,
      generationPrompt: true,
      provider: true,
      providerModel: true,
      scope: true,
      runtime: true,
      ownerId: true,
      owner: {
        select: {
          name: true,
          email: true
        }
      },
      createdAt: true,
      updatedAt: true
    }
  });

  return plugins
    .filter((plugin) => plugin.scope === PluginScope.SHARED || role === "ADMIN" || plugin.ownerId === userId)
    .map(serializePluginDefinition);
}

export async function savePluginDefinition(input: unknown, user: { sub: string; role: AppRole }) {
  const parsed = pluginDefinitionPayloadSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid plugin payload."
    };
  }

  const payload = parsed.data;

  try {
    assertValidPluginSourceCode(payload.sourceCode);
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Plugin source code is not allowed."
    };
  }

  if (payload.scope === "shared" && user.role !== "ADMIN") {
    return {
      ok: false as const,
      error: "Only admins can save shared plugins."
    };
  }

  if (payload.id) {
    const existing = await prisma.pluginDefinition.findUnique({
      where: {
        id: payload.id
      },
      select: {
        id: true,
        scope: true,
        ownerId: true
      }
    });

    if (!existing) {
      return {
        ok: false as const,
        error: "Plugin not found."
      };
    }

    if (existing.scope === PluginScope.SHARED && user.role !== "ADMIN") {
      return {
        ok: false as const,
        error: "Only admins can edit shared plugins."
      };
    }

    if (existing.scope === PluginScope.PERSONAL && existing.ownerId !== user.sub) {
      return {
        ok: false as const,
        error: "You can only edit your own personal plugins."
      };
    }

    const updated = await prisma.pluginDefinition.update({
      where: {
        id: payload.id
      },
      data: buildPluginWriteData(payload, user.sub),
      select: pluginDefinitionSelect
    });

    return {
      ok: true as const,
      plugin: serializePluginDefinition(updated)
    };
  }

  const created = await prisma.pluginDefinition.create({
    data: buildPluginWriteData(payload, user.sub),
    select: pluginDefinitionSelect
  });

  return {
    ok: true as const,
    plugin: serializePluginDefinition(created)
  };
}

export async function deletePluginDefinition(id: unknown, user: { sub: string; role: AppRole }) {
  const parsedId = pluginIdSchema.safeParse(id);

  if (!parsedId.success) {
    return {
      ok: false as const,
      error: "Plugin id is required."
    };
  }

  const existing = await prisma.pluginDefinition.findUnique({
    where: {
      id: parsedId.data
    },
    select: {
      id: true,
      scope: true,
      ownerId: true
    }
  });

  if (!existing) {
    return {
      ok: false as const,
      error: "Plugin not found."
    };
  }

  if (existing.scope === PluginScope.SHARED && user.role !== "ADMIN") {
    return {
      ok: false as const,
      error: "Only admins can delete shared plugins."
    };
  }

  if (existing.scope === PluginScope.PERSONAL && existing.ownerId !== user.sub) {
    return {
      ok: false as const,
      error: "You can only delete your own personal plugins."
    };
  }

  await prisma.pluginDefinition.delete({
    where: {
      id: parsedId.data
    }
  });

  return {
    ok: true as const
  };
}

function buildPluginWriteData(payload: PluginDefinitionPayload, userId: string): Prisma.PluginDefinitionUncheckedCreateInput {
  return {
    name: payload.name,
    description: payload.description || null,
    sourceCode: payload.sourceCode,
    protocolVersion: PLUGIN_PROTOCOL_VERSION,
    generationPrompt: payload.generationPrompt || null,
    provider: payload.provider ?? null,
    providerModel: payload.providerModel || null,
    scope: toPluginScope(payload.scope),
    runtime: toPluginRuntime(payload.runtime),
    ownerId: payload.scope === "shared" ? userId : userId
  };
}

const pluginDefinitionSelect = {
  id: true,
  name: true,
  description: true,
  sourceCode: true,
  protocolVersion: true,
  generationPrompt: true,
  provider: true,
  providerModel: true,
  scope: true,
  runtime: true,
  ownerId: true,
  owner: {
    select: {
      name: true,
      email: true
    }
  },
  createdAt: true,
  updatedAt: true
} satisfies Prisma.PluginDefinitionSelect;
