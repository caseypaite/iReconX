import { NextRequest, NextResponse } from "next/server";

import { requireApiSession } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

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

  const sources = await prisma.dataSource.findMany({
    where,
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      createdAt: true,
      updatedAt: true,
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
  });

  return NextResponse.json({
    sources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      description: source.description ?? "",
      type: source.type,
      owner: source.createdBy?.name?.trim() || source.createdBy?.email || "Unassigned",
      accessScope: auth.user.role === "ADMIN" ? "Admin" : "Assigned",
      sharedUsers: source._count.accessList,
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString()
    }))
  });
}
