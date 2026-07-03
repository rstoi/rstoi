"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAccess } from "@/lib/auth";
import { BacktestingAgent } from "@/agents/backtesting-agent";

export async function runBacktestingAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);
  const forecastId = String(formData.get("forecastId") ?? "");
  if (!forecastId) throw new Error("Selecione um forecast.");

  await new BacktestingAgent().run(
    { companyId, forecastId },
    { companyId, actorUserId: user.id, rationale: "Backtesting de forecast anterior contra realizado." }
  );

  revalidatePath(`/empresas/${companyId}/backtesting`);
}
