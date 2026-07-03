"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAccess } from "@/lib/auth";
import { ReportAgent } from "@/agents/report-agent";
import type { ReportType } from "@prisma/client";

export async function generateReportAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);
  const reportType = String(formData.get("reportType") ?? "INITIAL_DIAGNOSIS") as ReportType;

  await new ReportAgent().run(
    { companyId, reportType, generatedById: user.id },
    { companyId, actorUserId: user.id, rationale: `Geração de relatório ${reportType}.` }
  );

  revalidatePath(`/empresas/${companyId}/relatorios`);
}
