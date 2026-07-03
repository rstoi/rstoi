"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { ContinuousImprovementAgent } from "@/agents/continuous-improvement-agent";
import type { PDCAStatus, ImprovementStatus } from "@prisma/client";

export async function createImprovementCycleAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);
  const problem = String(formData.get("problem") ?? "").trim();
  const rootCauseHint = String(formData.get("rootCauseHint") ?? "") || undefined;
  const dueDate = formData.get("dueDate") ? new Date(String(formData.get("dueDate"))) : undefined;

  await new ContinuousImprovementAgent().run(
    { companyId, problem, rootCauseHint, dueDate },
    { companyId, actorUserId: user.id, rationale: "Registro manual de problema/melhoria." }
  );

  revalidatePath(`/empresas/${companyId}/pdca`);
}

export async function updatePdcaStageAction(companyId: string, pdcaId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);
  const field = String(formData.get("field") ?? "");
  const text = String(formData.get("text") ?? "");
  const status = String(formData.get("status") ?? undefined) as PDCAStatus | undefined;

  const data: Record<string, unknown> = {};
  if (field === "doText") data.doText = text;
  if (field === "checkText") data.checkText = text;
  if (field === "actText") data.actText = text;
  if (status) data.status = status;

  await prisma.pDCARecord.update({ where: { id: pdcaId }, data });
  await recordAudit({ companyId, actorUserId: user.id, action: "UPDATE", entityType: "PDCARecord", entityId: pdcaId, after: data });
  revalidatePath(`/empresas/${companyId}/pdca`);
}

export async function updateImprovementStatusAction(companyId: string, actionId: string, status: ImprovementStatus) {
  const user = await requireCompanyAccess(companyId);
  await prisma.improvementAction.update({ where: { id: actionId }, data: { status } });
  await recordAudit({ companyId, actorUserId: user.id, action: "UPDATE_STATUS", entityType: "ImprovementAction", entityId: actionId, after: { status } });
  revalidatePath(`/empresas/${companyId}/pdca`);
}
