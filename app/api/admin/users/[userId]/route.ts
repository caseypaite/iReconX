import { AuditAction, Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth/api";
import { normalizeMobileNumber } from "@/lib/auth/mobile";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  mobileNumber: z.string().min(8).optional().nullable(),
  role: z.nativeEnum(Role).optional(),
  password: z.string().min(8).optional(),
  isActive: z.boolean().optional()
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const auth = await requireApiSession(request, ["ADMIN"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid user payload." }, { status: 400 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: params.userId }
  });

  if (!currentUser) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const passwordHash = parsed.data.password ? await hashPassword(parsed.data.password) : undefined;
  const shouldInvalidateSession =
    parsed.data.password !== undefined ||
    parsed.data.role !== undefined ||
    parsed.data.isActive !== undefined ||
    parsed.data.mobileNumber !== undefined;

  if (
    auth.user.sub === params.userId &&
    (parsed.data.role === Role.USER || parsed.data.isActive === false)
  ) {
    return NextResponse.json(
      { error: "Admins cannot remove their own admin access or deactivate themselves." },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.update({
      where: { id: params.userId },
      data: {
        name: parsed.data.name,
        email: parsed.data.email?.toLowerCase(),
        mobileNumber:
          parsed.data.mobileNumber === undefined
            ? undefined
            : normalizeMobileNumber(parsed.data.mobileNumber),
        role: parsed.data.role,
        isActive: parsed.data.isActive,
        passwordHash,
        sessionVersion: shouldInvalidateSession ? { increment: 1 } : undefined
      },
      select: {
        id: true,
        email: true,
        name: true,
        mobileNumber: true,
        role: true,
        isActive: true,
        sessionVersion: true
      }
    });

    await createAuditLog({
      action: AuditAction.USER_UPDATED,
      actorId: auth.user.sub,
      entityType: "User",
      entityId: user.id,
      metadata: {
        role: user.role,
        isActive: user.isActive,
        sessionVersion: user.sessionVersion,
        mobileNumberRegistered: Boolean(user.mobileNumber)
      }
    });

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Mobile number must")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Email or mobile number is already in use." }, { status: 409 });
    }

    return NextResponse.json({ error: "Unable to update user." }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const auth = await requireApiSession(request, ["ADMIN"]);

  if ("response" in auth) {
    return auth.response;
  }

  if (auth.user.sub === params.userId) {
    return NextResponse.json({ error: "Admins cannot delete their own account." }, { status: 400 });
  }

  await prisma.user.delete({
    where: { id: params.userId }
  });

  await createAuditLog({
    action: AuditAction.USER_DELETED,
    actorId: auth.user.sub,
    entityType: "User",
    entityId: params.userId
  });

  return NextResponse.json({ ok: true });
}
