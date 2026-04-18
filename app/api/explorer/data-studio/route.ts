import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

const updateSourceDictionarySchema = z.object({
  sourceId: z.string().min(1, "Source id is required."),
  sourceKind: z.enum(["governed-source", "persistent-import"]),
  dataDictionary: z.string().max(200000, "Data dictionary must be 200,000 characters or fewer.")
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const where =
    auth.user.role === "ADMIN"
      ? undefined
      : {
          accessList: {
            some: {
              userId: auth.user.sub
            }
          }
        };

  const [sources, persistentImports] = await Promise.all([
    prisma.dataSource.findMany({
      where,
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        createdAt: true,
        updatedAt: true,
        dataDictionary: true,
        createdById: true,
        createdBy: {
          select: {
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            accessList: true
          }
        }
      }
    }),
    prisma.persistentDataset.findMany({
      orderBy: [{ label: "asc" }, { tableName: "asc" }],
      select: {
        id: true,
        label: true,
        tableName: true,
        sourceLabel: true,
        rowCount: true,
        columnCount: true,
        dataDictionary: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: {
            name: true,
            email: true
          }
        }
      }
    })
  ]);

  return NextResponse.json({
    sources: [
      ...sources.map((source) => ({
        id: source.id,
        sourceKind: "governed-source" as const,
        name: source.name,
        description: source.description ?? "",
        dataDictionary: source.dataDictionary ?? "",
        canEditDataDictionary: auth.user.role === "ADMIN" || source.createdById === auth.user.sub,
        type: source.type,
        tableName: "",
        owner: source.createdBy?.name?.trim() || source.createdBy?.email || "Unassigned",
        accessScope: auth.user.role === "ADMIN" ? "Admin" : "Assigned",
        sharedUsers: source._count.accessList,
        rowCount: null,
        columnCount: null,
        createdAt: source.createdAt.toISOString(),
        updatedAt: source.updatedAt.toISOString()
      })),
      ...persistentImports.map((dataset) => ({
        id: dataset.id,
        sourceKind: "persistent-import" as const,
        name: dataset.label,
        description: dataset.sourceLabel ? `Imported from ${dataset.sourceLabel}` : "Persistent imported table",
        dataDictionary: dataset.dataDictionary ?? "",
        canEditDataDictionary: auth.user.role === "ADMIN" || dataset.createdById === auth.user.sub,
        type: "Imported table",
        tableName: dataset.tableName,
        owner: dataset.createdBy?.name?.trim() || dataset.createdBy?.email || "Persistent store",
        accessScope: "Persistent import",
        sharedUsers: 0,
        rowCount: dataset.rowCount,
        columnCount: dataset.columnCount,
        createdAt: dataset.createdAt.toISOString(),
        updatedAt: dataset.updatedAt.toISOString()
      }))
    ]
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSourceDictionarySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data dictionary payload." }, { status: 400 });
  }

  const normalizedDictionary = parsed.data.dataDictionary.trim();

  if (parsed.data.sourceKind === "governed-source") {
    const source = await prisma.dataSource.findUnique({
      where: {
        id: parsed.data.sourceId
      },
      select: {
        id: true,
        createdById: true
      }
    });

    if (!source) {
      return NextResponse.json({ error: "The selected governed source was not found." }, { status: 404 });
    }

    if (auth.user.role !== "ADMIN" && source.createdById !== auth.user.sub) {
      return NextResponse.json({ error: "You cannot update this governed source dictionary." }, { status: 403 });
    }

    await prisma.dataSource.update({
      where: {
        id: parsed.data.sourceId
      },
      data: {
        dataDictionary: normalizedDictionary || null
      }
    });

    return NextResponse.json({ ok: true });
  }

  const dataset = await prisma.persistentDataset.findUnique({
    where: {
      id: parsed.data.sourceId
    },
    select: {
      id: true,
      createdById: true
    }
  });

  if (!dataset) {
    return NextResponse.json({ error: "The selected persistent import was not found." }, { status: 404 });
  }

  if (auth.user.role !== "ADMIN" && dataset.createdById !== auth.user.sub) {
    return NextResponse.json({ error: "You cannot update this persistent import dictionary." }, { status: 403 });
  }

  await prisma.persistentDataset.update({
    where: {
      id: parsed.data.sourceId
    },
    data: {
      dataDictionary: normalizedDictionary || null
    }
  });

  return NextResponse.json({ ok: true });
}
