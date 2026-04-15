import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyLoginOtpChallenge } from "@/lib/auth/login-otp";
import { signResetToken } from "@/lib/auth/token";

const schema = z.object({
  challengeId: z.string().uuid(),
  otp: z.string().regex(/^\d{6}$/)
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const user = await verifyLoginOtpChallenge(parsed.data.challengeId, parsed.data.otp);

  if (!user) {
    return NextResponse.json({ error: "Invalid or expired code." }, { status: 401 });
  }

  const resetToken = await signResetToken(user.id);

  return NextResponse.json({ resetToken });
}
