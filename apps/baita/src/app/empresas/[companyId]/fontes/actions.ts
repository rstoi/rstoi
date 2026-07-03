"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import type { DataSourceType, ReliabilityRating } from "@prisma/client";

export async function createDataSourceAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "OTHER") as DataSourceType;
  if (!name) throw new Error("Nome da fonte é obrigatório.");

  const source = await prisma.dataSource.create({
    data: {
      companyId,
      name,
      type,
      description: String(formData.get("description") ?? "") || null,
      ownerPersonId: String(formData.get("ownerPersonId") ?? "") || null,
      confidenceInitial: (String(formData.get("confidenceInitial") ?? "UNKNOWN") as ReliabilityRating) || "UNKNOWN",
      accessStatus: String(formData.get("accessStatus") ?? "PENDING"),
      availabilityStatus: String(formData.get("availabilityStatus") ?? "PENDING"),
    },
  });

  await recordAudit({
    companyId,
    actorUserId: user.id,
    action: "CREATE",
    entityType: "DataSource",
    entityId: source.id,
    after: { name, type },
  });

  revalidatePath(`/empresas/${companyId}/fontes`);
}
