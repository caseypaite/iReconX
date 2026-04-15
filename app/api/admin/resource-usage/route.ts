import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireApiSession } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN"]);

  if ("response" in auth) {
    return auth.response;
  }

  const [userCount, dataSourceCount, recentQueries] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.dataSource.count(),
    prisma.auditLog.count({ where: { action: AuditAction.QUERY_EXECUTED } })
  ]);

  return NextResponse.json({
    activeUsers: userCount,
    dataSources: dataSourceCount,
    queryExecutions: recentQueries
  });
}
