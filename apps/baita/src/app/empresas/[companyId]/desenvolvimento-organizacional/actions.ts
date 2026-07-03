"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/auth";
import { OrganizationalDevelopmentAgent } from "@/agents/organizational-development-agent";
import type { AdizesLifecycleStage } from "@prisma/client";

export async function updateAdizesStageAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);
  const observedStage = String(formData.get("observedStage") ?? "UNKNOWN") as AdizesLifecycleStage;
  const stageConfidence = parseFloat(String(formData.get("stageConfidence") ?? "0.5"));

  await new OrganizationalDevelopmentAgent().run(
    { companyId, observedStage, stageConfidence },
    { companyId, actorUserId: user.id, rationale: "Atualização do estágio Adizes observado." }
  );

  revalidatePath(`/empresas/${companyId}/desenvolvimento-organizacional`);
}

export async function advanceManagementLevelAction(companyId: string) {
  const user = await requireCompanyAccess(companyId);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  await prisma.company.update({
    where: { id: companyId },
    data: { managementSystemLevel: Math.min(company.managementSystemLevel + 1, 5) },
  });
  void user;
  revalidatePath(`/empresas/${companyId}/desenvolvimento-organizacional`);
}
