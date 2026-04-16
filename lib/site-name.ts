import { cache } from "react";

import { prisma } from "@/lib/prisma";

export const DEFAULT_SITE_NAME = "iReconX Analytics Studio";

function normalizeSiteName(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_SITE_NAME;
}

export const loadSiteName = cache(async () => {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: {
        key: "SITE_NAME"
      },
      select: {
        value: true
      }
    });

    return normalizeSiteName(setting?.value ?? process.env.SITE_NAME);
  } catch {
    return normalizeSiteName(process.env.SITE_NAME);
  }
});
