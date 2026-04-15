import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth/api";

const queryPayloadSchema = z.object({
  source: z.string(),
  target: z.string(),
  mode: z.enum(["builder", "sql"]),
  limit: z.number().min(1).max(1000),
  filters: z.array(
    z.object({
      field: z.string(),
      operator: z.enum(["equals", "contains", "gt", "lt"]),
      value: z.string()
    })
  ),
  sql: z.string().optional()
});

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json();
  const parsed = queryPayloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query payload." }, { status: 400 });
  }

  await createAuditLog({
    action: AuditAction.QUERY_EXECUTED,
    actorId: auth.user.sub,
    entityType: "Query",
    metadata: {
      source: parsed.data.source,
      target: parsed.data.target,
      mode: parsed.data.mode
    }
  });

  return NextResponse.json({
    status: "accepted",
    preview: {
      rows: [],
      total: 0
    },
    metadata: {
      target: parsed.data.target,
      limit: parsed.data.limit
    }
  });
}

