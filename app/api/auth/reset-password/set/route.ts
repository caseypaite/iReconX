import { AuditAction } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { verifyResetToken } from "@/lib/auth/token";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  resetToken: z.string(),
  password: z.string().min(8).max(128)
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let userId: string;

  try {
    ({ userId } = await verifyResetToken(parsed.data.resetToken));
  } catch {
    return NextResponse.json({ error: "Reset link has expired." }, { status: 400 });
  }

  const hashed = await hashPassword(parsed.data.password);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashed, sessionVersion: { increment: 1 } }
  });

  await createAuditLog({
    action: AuditAction.USER_UPDATED,
    actorId: userId,
    entityType: "PasswordReset",
    entityId: userId
  });

  return NextResponse.json({ ok: true });
}
