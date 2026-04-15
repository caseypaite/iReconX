import { AuditAction, DataSourceType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { createAuditLog } from "@/lib/audit";
import {
  type AdminAssignableUser,
  adminDataSourceSchema,
  normalizeAdminDataSourceConfig,
  updateAdminDataSourceSchema
} from "@/lib/admin/data-sources";
import { requireApiSession } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { decryptJson, encryptJson } from "@/lib/security/secrets";

function serializeDataSource(dataSource: {
  id: string;
  name: string;
  description: string | null;
  type: DataSourceType;
  configCiphertext: string;
  accessList: Array<{
    userId: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: dataSource.id,
    name: dataSource.name,
    description: dataSource.description ?? "",
    type: dataSource.type,
    allowedUserIds: dataSource.accessList.map((entry) => entry.userId),
    config: normalizeAdminDataSourceConfig(
      decryptJson<Record<string, unknown>>(dataSource.configCiphertext),
      dataSource.type
    ),
    createdAt: dataSource.createdAt.toISOString(),
    updatedAt: dataSource.updatedAt.toISOString()
  };
}

function serializeAssignableUser(user: {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "USER";
  isActive: boolean;
}): AdminAssignableUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN"]);

  if ("response" in auth) {
    return auth.response;
  }

  const [dataSources, users] = await Promise.all([
    prisma.dataSource.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        configCiphertext: true,
        accessList: {
          select: {
            userId: true
          }
        },
        createdAt: true,
        updatedAt: true
      }
    }),
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true
      }
    })
  ]);

  return NextResponse.json({ dataSources: dataSources.map(serializeDataSource), users: users.map(serializeAssignableUser) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = adminDataSourceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data source payload." }, { status: 400 });
  }

  const allowedUsers = await prisma.user.findMany({
    where: {
      id: {
        in: parsed.data.allowedUserIds
      }
    },
    select: {
      id: true
    }
  });

  if (allowedUsers.length !== parsed.data.allowedUserIds.length) {
    return NextResponse.json({ error: "One or more selected users could not be found." }, { status: 400 });
  }

  const dataSource = await prisma.dataSource.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description?.trim() || undefined,
      type: parsed.data.type,
      configCiphertext: encryptJson(parsed.data.config),
      createdById: auth.user.sub,
      accessList: {
        create: parsed.data.allowedUserIds.map((userId) => ({
          userId
        }))
      }
    },
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      configCiphertext: true,
      accessList: {
        select: {
          userId: true
        }
      },
      createdAt: true,
      updatedAt: true
    }
  });

  await createAuditLog({
    action: AuditAction.DATASOURCE_CREATED,
    actorId: auth.user.sub,
    entityType: "DataSource",
    entityId: dataSource.id,
    metadata: {
      type: dataSource.type,
      allowedUsers: parsed.data.allowedUserIds.length
    }
  });

  return NextResponse.json({ dataSource: serializeDataSource(dataSource) }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = updateAdminDataSourceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data source payload." }, { status: 400 });
  }

  const allowedUsers = await prisma.user.findMany({
    where: {
      id: {
        in: parsed.data.allowedUserIds
      }
    },
    select: {
      id: true
    }
  });

  if (allowedUsers.length !== parsed.data.allowedUserIds.length) {
    return NextResponse.json({ error: "One or more selected users could not be found." }, { status: 400 });
  }

  const existing = await prisma.dataSource.findUnique({
    where: {
      id: parsed.data.id
    },
    select: {
      id: true
    }
  });

  if (!existing) {
    return NextResponse.json({ error: "Data source not found." }, { status: 404 });
  }

  const dataSource = await prisma.dataSource.update({
    where: {
      id: parsed.data.id
    },
    data: {
      name: parsed.data.name,
      description: parsed.data.description?.trim() || undefined,
      type: parsed.data.type,
      configCiphertext: encryptJson(parsed.data.config),
      accessList: {
        deleteMany: {},
        create: parsed.data.allowedUserIds.map((userId) => ({
          userId
        }))
      }
    },
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      configCiphertext: true,
      accessList: {
        select: {
          userId: true
        }
      },
      createdAt: true,
      updatedAt: true
    }
  });

  await createAuditLog({
    action: AuditAction.DATASOURCE_UPDATED,
    actorId: auth.user.sub,
    entityType: "DataSource",
    entityId: dataSource.id,
    metadata: {
      type: dataSource.type,
      allowedUsers: parsed.data.allowedUserIds.length
    }
  });

  return NextResponse.json({ dataSource: serializeDataSource(dataSource) });
}
