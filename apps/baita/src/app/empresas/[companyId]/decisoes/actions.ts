"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import type { DecisionStatus, ForecastScenario, ReliabilityRating } from "@prisma/client";

export async function createDecisionAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);

  const decision = await prisma.decision.create({
    data: {
      companyId,
      title: String(formData.get("title") ?? "").trim(),
      decisionText: String(formData.get("decisionText") ?? "").trim(),
      decidedByUserId: user.id,
      scenarioConsidered: (String(formData.get("scenarioConsidered") ?? "") as ForecastScenario) || null,
      informationRating: (String(formData.get("informationRating") ?? "UNKNOWN") as ReliabilityRating) || "UNKNOWN",
      expectedImpact: String(formData.get("expectedImpact") ?? "") || null,
      responsiblePerson: String(formData.get("responsiblePerson") ?? "") || null,
      deadline: formData.get("deadline") ? new Date(String(formData.get("deadline"))) : null,
      recommendationId: String(formData.get("recommendationId") ?? "") || null,
    },
  });

  await recordAudit({
    companyId,
    actorUserId: user.id,
    action: "CREATE",
    entityType: "Decision",
    entityId: decision.id,
    after: { title: decision.title },
    rationale: "Registro de decisão executiva.",
  });

  revalidatePath(`/empresas/${companyId}/decisoes`);
}

export async function updateDecisionStatusAction(companyId: string, decisionId: string, status: DecisionStatus) {
  const user = await requireCompanyAccess(companyId);
  await prisma.decision.update({ where: { id: decisionId }, data: { status } });
  await recordAudit({
    companyId,
    actorUserId: user.id,
    action: "UPDATE_STATUS",
    entityType: "Decision",
    entityId: decisionId,
    after: { status },
  });
  revalidatePath(`/empresas/${companyId}/decisoes`);
}
