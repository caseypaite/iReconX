import { AuditAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth/api";
import { normalizeMobileNumber } from "@/lib/auth/mobile";
import { prisma } from "@/lib/prisma";

const optionalTextField = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((value) => (value && value.length > 0 ? value : null));

const optionalLongTextField = z
  .string()
  .trim()
  .max(4000)
  .optional()
  .nullable()
  .transform((value) => (value && value.length > 0 ? value : null));

const optionalUrlField = z
  .string()
  .trim()
  .url()
  .optional()
  .nullable()
  .or(z.literal(""))
  .transform((value) => (value && value.length > 0 ? value : null));

const updateProfileSchema = z.object({
  name: optionalTextField,
  headline: optionalTextField,
  location: optionalTextField,
  summary: optionalLongTextField,
  experience: optionalLongTextField,
  education: optionalLongTextField,
  skills: optionalLongTextField,
  websiteUrl: optionalUrlField,
  linkedinUrl: optionalUrlField,
  mobileNumber: z.string().trim().optional().nullable()
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request);

  if ("response" in auth) {
    return auth.response;
  }

  const profile = await prisma.user.findUnique({
    where: { id: auth.user.sub },
    select: {
      email: true,
      name: true,
      headline: true,
      location: true,
      summary: true,
      experience: true,
      education: true,
      skills: true,
      websiteUrl: true,
      linkedinUrl: true,
      mobileNumber: true,
      role: true
    }
  });

  if (!profile) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({ profile });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiSession(request);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = updateProfileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile payload." }, { status: 400 });
  }

  try {
    const profile = await prisma.user.update({
      where: { id: auth.user.sub },
      data: {
        name: parsed.data.name,
        headline: parsed.data.headline,
        location: parsed.data.location,
        summary: parsed.data.summary,
        experience: parsed.data.experience,
        education: parsed.data.education,
        skills: parsed.data.skills,
        websiteUrl: parsed.data.websiteUrl,
        linkedinUrl: parsed.data.linkedinUrl,
        mobileNumber:
          parsed.data.mobileNumber === undefined
            ? undefined
            : normalizeMobileNumber(parsed.data.mobileNumber ?? undefined)
      },
      select: {
        email: true,
        name: true,
        headline: true,
        location: true,
        summary: true,
        experience: true,
        education: true,
        skills: true,
        websiteUrl: true,
        linkedinUrl: true,
        mobileNumber: true,
        role: true
      }
    });

    await createAuditLog({
      action: AuditAction.USER_UPDATED,
      actorId: auth.user.sub,
      entityType: "UserProfile",
      entityId: auth.user.sub,
      metadata: {
        mobileNumberRegistered: Boolean(profile.mobileNumber),
        headlineConfigured: Boolean(profile.headline),
        summaryConfigured: Boolean(profile.summary)
      }
    });

    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Mobile number must")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Mobile number is already in use." }, { status: 409 });
    }

    return NextResponse.json({ error: "Unable to update profile." }, { status: 500 });
  }
}
