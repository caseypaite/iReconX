import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

import { normalizeMobileNumber } from "@/lib/auth/mobile";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@ireconx.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const mobileNumber = normalizeMobileNumber(process.env.SEED_ADMIN_MOBILE_NUMBER);
  const passwordHash = await hash(password, 12);
  const existingAdmin = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
    select: { id: true }
  });

  if (existingAdmin) {
    return;
  }

  const existingUser = await prisma.user.findUnique({
    where: { email }
  });

  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
        mobileNumber
      }
    });
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name: "Platform Admin",
      passwordHash,
      role: Role.ADMIN,
      mobileNumber
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
