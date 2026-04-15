import { AuditAction } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { createLoginOtpChallenge } from "@/lib/auth/login-otp";
import { sendOtpMessage } from "@/lib/auth/otp-delivery";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionResponse } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid login request." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() }
  });

  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const isValidPassword = await verifyPassword(parsed.data.password, user.passwordHash);

  if (!isValidPassword) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  if (user.mobileNumber) {
    try {
      const challenge = await createLoginOtpChallenge(user.id, user.mobileNumber);

      try {
        await sendOtpMessage(user.mobileNumber, challenge.code);
      } catch (error) {
        await prisma.loginOtpChallenge.delete({
          where: { id: challenge.challengeId }
        });
        throw error;
      }

      return NextResponse.json({
        requiresOtp: true,
        challengeId: challenge.challengeId,
        destinationHint: challenge.destinationHint,
        expiresInSeconds: challenge.expiresInSeconds
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Unable to send the verification code right now."
        },
        { status: 503 }
      );
    }
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
