import { type NextRequest, NextResponse } from "next/server";

import { getSessionFromToken } from "@/lib/auth/session";
import { canAccessRole, SESSION_COOKIE } from "@/lib/auth/token";
import type { AppRole, AuthenticatedUser } from "@/types/auth";

export type ApiAuthResult =
  | { user: AuthenticatedUser; response?: never }
  | { user?: never; response: NextResponse };

export async function requireApiSession(
  request: NextRequest,
  allowedRoles?: AppRole[]
): Promise<ApiAuthResult> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getSessionFromToken(token);

  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  if (allowedRoles && !canAccessRole(user.role, allowedRoles)) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 })
    };
  }

  return { user };
}
