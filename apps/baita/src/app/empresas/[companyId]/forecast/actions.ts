"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAccess } from "@/lib/auth";
import { ForecastAgent } from "@/agents/forecast-agent";
import { TreasuryAgent } from "@/agents/treasury-agent";
import type { ForecastScenario } from "@prisma/client";

export async function generateForecastAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);
  const scenario = String(formData.get("scenario") ?? "BASE") as ForecastScenario;
  const horizon = String(formData.get("horizon") ?? "30_DAYS");

  const treasury = await new TreasuryAgent().run({ companyId });

  await new ForecastAgent().run(
    {
      companyId,
      startingBalance: treasury.output.currentCash,
      scenario,
      horizonEndOfYear: horizon === "END_OF_YEAR",
      horizonDays: 30,
    },
    { companyId, actorUserId: user.id, rationale: `Geração de forecast (${scenario}, ${horizon}).` }
  );

  revalidatePath(`/empresas/${companyId}/forecast`);
}
