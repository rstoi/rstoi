import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type AuditInput = {
  companyId?: string | null;
  actorUserId?: string | null;
  agentName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  rationale?: string | null;
};

/**
 * Toda mutação relevante do sistema (manual ou por agente) deve gerar um registro
 * de auditoria. Nunca apagar dado bruto sem registro correspondente.
 */
export async function recordAudit(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      companyId: input.companyId ?? null,
      actorUserId: input.actorUserId ?? null,
      agentName: input.agentName ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeJson: (input.before as Prisma.InputJsonValue) ?? undefined,
      afterJson: (input.after as Prisma.InputJsonValue) ?? undefined,
      rationale: input.rationale ?? null,
    },
  });
}
