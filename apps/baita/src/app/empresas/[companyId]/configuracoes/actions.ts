"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import type { DreLine } from "@prisma/client";

export async function createManagementCategoryAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nome da categoria é obrigatório.");

  const category = await prisma.managementCategory.create({
    data: {
      companyId,
      name,
      dreLine: (String(formData.get("dreLine") ?? "NOT_APPLICABLE") as DreLine) || "NOT_APPLICABLE",
      ruleHints: String(formData.get("ruleHints") ?? "") || null,
      cashFlowGroup: String(formData.get("cashFlowGroup") ?? "") || null,
    },
  });

  await recordAudit({
    companyId,
    actorUserId: user.id,
    action: "CREATE",
    entityType: "ManagementCategory",
    entityId: category.id,
    after: { name },
  });

  revalidatePath(`/empresas/${companyId}/configuracoes`);
}

export async function deactivateManagementCategoryAction(companyId: string, categoryId: string) {
  const user = await requireCompanyAccess(companyId);
  await prisma.managementCategory.update({ where: { id: categoryId }, data: { isActive: false } });
  await recordAudit({ companyId, actorUserId: user.id, action: "DEACTIVATE", entityType: "ManagementCategory", entityId: categoryId });
  revalidatePath(`/empresas/${companyId}/configuracoes`);
}
