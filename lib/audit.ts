import { AuditAction, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AuditInput = {
  action: AuditAction;
  actorId?: string | null;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function createAuditLog(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      action: input.action,
      actorId: input.actorId ?? undefined,
      entityType: input.entityType,
      entityId: input.entityId ?? undefined,
      metadata: input.metadata as Prisma.InputJsonValue | undefined
    }
  });
}
