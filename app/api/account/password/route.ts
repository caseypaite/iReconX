import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth/api";
import { getExpiredSessionCookie } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8),
    nextPassword: z.string().min(8),
    confirmPassword: z.string().min(8)
  })
  .refine((value) => value.nextPassword === value.confirmPassword, {
    message: "New passwords do not match.",
    path: ["confirmPassword"]
  })
  .refine((value) => value.currentPassword !== value.nextPassword, {
    message: "New password must be different from the current password.",
    path: ["nextPassword"]
  });

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid password payload." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.user.sub },
    select: {
      id: true,
      passwordHash: true
    }
  });

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const currentPasswordIsValid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);

  if (!currentPasswordIsValid) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: auth.user.sub },
    data: {
      passwordHash: await hashPassword(parsed.data.nextPassword),
      sessionVersion: { increment: 1 }
    }
  });

  await createAuditLog({
    action: AuditAction.USER_UPDATED,
    actorId: auth.user.sub,
    entityType: "UserPassword",
    entityId: auth.user.sub,
    metadata: {
      sessionsInvalidated: true
    }
  });

  const response = NextResponse.json({
    ok: true,
    redirectTo: "/login"
  });
  const expiredCookie = getExpiredSessionCookie();

  response.cookies.set(expiredCookie.name, expiredCookie.value, expiredCookie.options);

  return response;
}
