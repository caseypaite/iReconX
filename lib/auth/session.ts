import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { canAccessRole, getExpiredSessionCookie, getSessionCookie, SESSION_COOKIE, signSession, verifySessionToken } from "@/lib/auth/token";
import type { AppRole, AuthenticatedUser, SessionToken } from "@/types/auth";

export async function getSessionFromToken(token?: string | null): Promise<AuthenticatedUser | null> {
  if (!token) {
    return null;
  }

  try {
    const payload = await verifySessionToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        sessionVersion: true
      }
    });

    if (!user || !user.isActive || user.sessionVersion !== payload.sessionVersion) {
      return null;
    }

    return {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role as AppRole,
      isActive: user.isActive,
      sessionVersion: user.sessionVersion
    };
  } catch {
    return null;
  }
}

export async function getServerSession() {
  return getSessionFromToken(cookies().get(SESSION_COOKIE)?.value);
}

export async function requireServerSession(role?: AppRole) {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if (role && session.role !== role) {
    redirect(session.role === "ADMIN" ? "/admin" : "/forbidden");
  }

  return session;
}

type SessionResponseUser = SessionToken & {
  role: AppRole;
};

export async function createSessionResponse(user: SessionResponseUser) {
  const token = await signSession({
    sub: user.sub,
    email: user.email,
    name: user.name,
    role: user.role,
    sessionVersion: user.sessionVersion
  });

  const response = NextResponse.json({
    redirectTo: user.role === "ADMIN" ? "/admin" : "/dashboard"
  });
  const cookie = getSessionCookie(token);

  response.cookies.set(cookie.name, cookie.value, cookie.options);

  return response;
}

export { SESSION_COOKIE, signSession, verifySessionToken, getSessionCookie, getExpiredSessionCookie, canAccessRole };
