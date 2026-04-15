import { JWTPayload, jwtVerify, SignJWT } from "jose";

import type { AppRole, SessionToken } from "@/types/auth";

export const SESSION_COOKIE = "ireconx_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

type SessionPayload = JWTPayload & SessionToken;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET must be set.");
  }

  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionToken) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return payload as SessionPayload;
}

export function getSessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS
    }
  };
}

export function getExpiredSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0
    }
  };
}

export function canAccessRole(role: AppRole, allowedRoles: AppRole[]) {
  return allowedRoles.includes(role);
}

