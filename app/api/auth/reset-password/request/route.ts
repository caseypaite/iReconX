import { NextResponse } from "next/server";
import { z } from "zod";

import { createLoginOtpChallenge } from "@/lib/auth/login-otp";
import { sendOtpMessage } from "@/lib/auth/otp-delivery";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().email()
});

const GENERIC_RESPONSE = {
  error: "If that email has a registered mobile number, a code will be sent."
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() }
  });

  if (!user || !user.isActive || !user.mobileNumber) {
    return NextResponse.json(GENERIC_RESPONSE);
  }

  const challenge = await createLoginOtpChallenge(user.id, user.mobileNumber);

  try {
    await sendOtpMessage(user.mobileNumber, challenge.code);
  } catch {
    return NextResponse.json({ error: "Unable to send the code right now. Please try again." }, { status: 503 });
  }

  return NextResponse.json({
    challengeId: challenge.challengeId,
    destinationHint: challenge.destinationHint,
    expiresInSeconds: challenge.expiresInSeconds
  });
}
