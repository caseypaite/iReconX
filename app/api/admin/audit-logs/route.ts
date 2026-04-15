import { NextRequest, NextResponse } from "next/server";

import { requireApiSession } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN"]);

  if ("response" in auth) {
    return auth.response;
  }

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      actorId: true,
      createdAt: true,
      metadata: true
    }
  });

  return NextResponse.json({ logs });
}

