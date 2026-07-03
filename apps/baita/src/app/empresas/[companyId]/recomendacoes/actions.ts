"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import type { Criticality, ReliabilityRating, RecommendationArea, RecommendationStatus } from "@prisma/client";

export async function createRecommendationAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);

  const recommendation = await prisma.recommendation.create({
    data: {
      companyId,
      title: String(formData.get("title") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      area: (String(formData.get("area") ?? "TREASURY") as RecommendationArea) || "TREASURY",
      urgency: (String(formData.get("urgency") ?? "MEDIUM") as Criticality) || "MEDIUM",
      impact: (String(formData.get("impact") ?? "MEDIUM") as Criticality) || "MEDIUM",
      confidence: (String(formData.get("confidence") ?? "UNKNOWN") as ReliabilityRating) || "UNKNOWN",
      expectedFinancialImpact: formData.get("expectedFinancialImpact")
        ? parseFloat(String(formData.get("expectedFinancialImpact")))
        : null,
      deadline: formData.get("deadline") ? new Date(String(formData.get("deadline"))) : null,
      ownerPersonId: String(formData.get("ownerPersonId") ?? "") || null,
    },
  });

  await recordAudit({
    companyId,
    actorUserId: user.id,
    action: "CREATE",
    entityType: "Recommendation",
    entityId: recommendation.id,
    after: { title: recommendation.title },
  });

  revalidatePath(`/empresas/${companyId}/recomendacoes`);
}

export async function updateRecommendationStatusAction(
  companyId: string,
  recommendationId: string,
  status: RecommendationStatus
) {
  const user = await requireCompanyAccess(companyId);
  await prisma.recommendation.update({ where: { id: recommendationId }, data: { status } });
  await recordAudit({
    companyId,
    actorUserId: user.id,
    action: "UPDATE_STATUS",
    entityType: "Recommendation",
    entityId: recommendationId,
    after: { status },
  });
  revalidatePath(`/empresas/${companyId}/recomendacoes`);
}
