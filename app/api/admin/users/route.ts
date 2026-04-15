import { AuditAction, Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { normalizeMobileNumber } from "@/lib/auth/mobile";
import { requireApiSession } from "@/lib/auth/api";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  password: z.string().min(8),
  mobileNumber: z.string().min(8).optional(),
  role: z.nativeEnum(Role).default(Role.USER),
  isActive: z.boolean().optional()
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN"]);

  if ("response" in auth) {
    return auth.response;
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      mobileNumber: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid user payload." }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);

  try {
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email.toLowerCase(),
        name: parsed.data.name,
        mobileNumber: normalizeMobileNumber(parsed.data.mobileNumber),
        passwordHash,
        role: parsed.data.role,
        isActive: parsed.data.isActive
      },
      select: {
        id: true,
        email: true,
        name: true,
        mobileNumber: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    await createAuditLog({
      action: AuditAction.USER_CREATED,
      actorId: auth.user.sub,
      entityType: "User",
      entityId: user.id,
      metadata: {
        role: user.role,
        mobileNumberRegistered: Boolean(user.mobileNumber)
      }
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Mobile number must")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Email or mobile number is already in use." }, { status: 409 });
    }

    return NextResponse.json({ error: "Unable to create user." }, { status: 500 });
  }
}
