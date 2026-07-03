"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function createCompanyAction(formData: FormData) {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nome da empresa é obrigatório.");

  const company = await prisma.company.create({
    data: {
      name,
      legalName: String(formData.get("legalName") ?? "") || null,
      cnpj: String(formData.get("cnpj") ?? "") || null,
      industry: String(formData.get("industry") ?? "") || null,
      revenueRange: String(formData.get("revenueRange") ?? "") || null,
      employeeRange: String(formData.get("employeeRange") ?? "") || null,
      mainPains: String(formData.get("mainPains") ?? "") || null,
      perceivedStage: String(formData.get("perceivedStage") ?? "") || null,
      existingSystems: String(formData.get("existingSystems") ?? "") || null,
      banksUsed: String(formData.get("banksUsed") ?? "") || null,
    },
  });

  // Onboarding: cria os ciclos de implantação e vincula o criador à empresa.
  await prisma.implementationCycle.createMany({
    data: [
      "CYCLE_0_SCOPE",
      "CYCLE_1_CASH",
      "CYCLE_2_DRE",
      "CYCLE_3_FINANCIAL_POSITION",
      "CYCLE_4_FORECAST",
      "CYCLE_5_RECONCILIATION",
      "CYCLE_6_BACKTESTING",
      "RECURRING",
    ].map((stage) => ({ companyId: company.id, stage: stage as never, status: "NOT_STARTED" as const })),
  });
  await prisma.implementationCycle.update({
    where: { companyId_stage: { companyId: company.id, stage: "CYCLE_0_SCOPE" } },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });

  await prisma.companyUserAccess.create({
    data: { companyId: company.id, userId: user.id, role: user.role },
  });

  await recordAudit({
    companyId: company.id,
    actorUserId: user.id,
    action: "CREATE",
    entityType: "Company",
    entityId: company.id,
    after: { name },
    rationale: "Onboarding de nova empresa.",
  });

  revalidatePath("/empresas");
  redirect(`/empresas/${company.id}`);
}
