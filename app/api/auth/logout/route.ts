import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { createAuditLog } from "@/lib/audit";
import { getExpiredSessionCookie, getSessionFromToken, SESSION_COOKIE } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  const session = await getSessionFromToken(token);

  if (session) {
    await createAuditLog({
      action: AuditAction.LOGOUT,
      actorId: session.sub,
      entityType: "User",
      entityId: session.sub
    });
  }

  const response = NextResponse.json({ ok: true });
  const expiredCookie = getExpiredSessionCookie();
  response.cookies.set(expiredCookie.name, expiredCookie.value, expiredCookie.options);

  return response;
}
