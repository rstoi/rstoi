"use server";

import { revalidatePath } from "next/cache";
import { endOfMonth, startOfMonth } from "date-fns";
import { requireCompanyAccess } from "@/lib/auth";
import { DREAgent } from "@/agents/dre-agent";

export async function generateDreAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);
  const monthValue = String(formData.get("month") ?? ""); // yyyy-MM
  const [year, month] = monthValue.split("-").map(Number);
  const reference = new Date(year, (month || 1) - 1, 1);

  await new DREAgent().run(
    { companyId, periodStart: startOfMonth(reference), periodEnd: endOfMonth(reference) },
    { companyId, actorUserId: user.id, rationale: `Geração de DRE para ${monthValue}.` }
  );

  revalidatePath(`/empresas/${companyId}/dre`);
}
