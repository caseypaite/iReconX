import { AuditAction } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { normalizeMobileNumber } from "@/lib/auth/mobile";
import { hashPassword } from "@/lib/auth/password";
import { createSessionResponse } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
  mobile: z.string().trim().optional()
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { name, email, password, mobile } = parsed.data;

  let normalizedMobile: string | null = null;

  if (mobile) {
    try {
      normalizedMobile = normalizeMobileNumber(mobile);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid mobile number." }, { status: 400 });
    }
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const createdUser = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: "USER",
      isActive: true,
      mobileNumber: normalizedMobile ?? null
    }
  });

  await createAuditLog({
    action: AuditAction.USER_CREATED,
    actorId: createdUser.id,
    entityType: "User",
    entityId: createdUser.id
  });

  return createSessionResponse({
    sub: createdUser.id,
    email: createdUser.email,
    name: createdUser.name,
    role: createdUser.role,
    sessionVersion: createdUser.sessionVersion
  });
}
