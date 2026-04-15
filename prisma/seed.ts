import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

import { normalizeMobileNumber } from "@/lib/auth/mobile";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@ireconx.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const mobileNumber = normalizeMobileNumber(process.env.SEED_ADMIN_MOBILE_NUMBER);

  const passwordHash = await hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
      mobileNumber
    },
    create: {
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
