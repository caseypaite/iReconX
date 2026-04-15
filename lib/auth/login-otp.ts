import { createHmac, randomInt, randomUUID } from "crypto";

import type { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { maskMobileNumber } from "@/lib/auth/mobile";

const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;

function getOtpSecret() {
  const secret = process.env.OTP_SECRET ?? process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("OTP_SECRET or JWT_SECRET must be set.");
  }

  return secret;
}

function hashOtp(challengeId: string, code: string) {
  return createHmac("sha256", getOtpSecret()).update(`${challengeId}:${code}`).digest("hex");
}

function generateOtpCode() {
  return `${randomInt(100000, 1_000_000)}`;
}

export type OtpChallengeResult = {
  challengeId: string;
  destinationHint: string;
  expiresInSeconds: number;
  code: string;
};

export async function createLoginOtpChallenge(userId: string, mobileNumber: string): Promise<OtpChallengeResult> {
  const challengeId = randomUUID();
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);

  await prisma.$transaction([
    prisma.loginOtpChallenge.deleteMany({
      where: {
        userId,
        consumedAt: null
      }
    }),
    prisma.loginOtpChallenge.create({
      data: {
        id: challengeId,
        userId,
        destination: mobileNumber,
        codeHash: hashOtp(challengeId, code),
        expiresAt
      }
    })
  ]);

  return {
    challengeId,
    destinationHint: maskMobileNumber(mobileNumber),
    expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
    code
  };
}

type VerifiedOtpUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  sessionVersion: number;
  isActive: boolean;
};

export async function verifyLoginOtpChallenge(challengeId: string, code: string): Promise<VerifiedOtpUser | null> {
  const challenge = await prisma.loginOtpChallenge.findUnique({
    where: { id: challengeId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          sessionVersion: true,
          isActive: true
        }
      }
    }
  });

  if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) {
    return null;
  }

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    return null;
  }

  if (challenge.codeHash !== hashOtp(challenge.id, code)) {
    await prisma.loginOtpChallenge.update({
      where: { id: challenge.id },
      data: {
        attempts: {
          increment: 1
        }
      }
    });

    return null;
  }

  await prisma.loginOtpChallenge.update({
    where: { id: challenge.id },
    data: {
      consumedAt: new Date()
    }
  });

  if (!challenge.user.isActive) {
    return null;
  }

  return challenge.user;
}
