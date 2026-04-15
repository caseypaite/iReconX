import { AuditAction, DataSourceType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { encryptJson } from "@/lib/security/secrets";

const dataSourceSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  type: z.nativeEnum(DataSourceType),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN"]);

  if ("response" in auth) {
    return auth.response;
  }

  const dataSources = await prisma.dataSource.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return NextResponse.json({ dataSources });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json();
  const parsed = dataSourceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data source payload." }, { status: 400 });
  }

  const dataSource = await prisma.dataSource.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      type: parsed.data.type,
      configCiphertext: encryptJson(parsed.data.config),
      createdById: auth.user.sub
    },
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      createdAt: true
    }
  });

  await createAuditLog({
    action: AuditAction.DATASOURCE_CREATED,
    actorId: auth.user.sub,
    entityType: "DataSource",
    entityId: dataSource.id,
    metadata: {
      type: dataSource.type
    }
  });

  return NextResponse.json({ dataSource }, { status: 201 });
}

