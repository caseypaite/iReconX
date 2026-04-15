import { AuditAction } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { createSessionResponse } from "@/lib/auth/session";
import { verifyLoginOtpChallenge } from "@/lib/auth/login-otp";

const verifyOtpSchema = z.object({
  challengeId: z.string().uuid(),
  otp: z.string().regex(/^\d{6}$/)
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = verifyOtpSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
  }

  const user = await verifyLoginOtpChallenge(parsed.data.challengeId, parsed.data.otp);

  if (!user) {
    return NextResponse.json({ error: "Invalid or expired verification code." }, { status: 401 });
  }

  await createAuditLog({
    action: AuditAction.LOGIN,
    actorId: user.id,
    entityType: "User",
    entityId: user.id
  });

  return createSessionResponse({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    sessionVersion: user.sessionVersion
  });
}
