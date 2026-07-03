"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import type { CareerStage } from "@prisma/client";

export async function createPersonAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nome é obrigatório.");

  const person = await prisma.person.create({
    data: {
      companyId,
      name,
      email: String(formData.get("email") ?? "") || null,
      phone: String(formData.get("phone") ?? "") || null,
      formalRole: String(formData.get("formalRole") ?? "") || null,
      realRole: String(formData.get("realRole") ?? "") || null,
      careerStage: (String(formData.get("careerStage") ?? "GROWING") as CareerStage) || "GROWING",
      preferredChannel: String(formData.get("preferredChannel") ?? "") || null,
      preferredFormat: String(formData.get("preferredFormat") ?? "") || null,
      bestInteractionWindow: String(formData.get("bestInteractionWindow") ?? "") || null,
    },
  });

  await recordAudit({
    companyId,
    actorUserId: user.id,
    action: "CREATE",
    entityType: "Person",
    entityId: person.id,
    after: { name },
  });

  revalidatePath(`/empresas/${companyId}/pessoas`);
}

export async function togglePersonActiveAction(companyId: string, personId: string, active: boolean) {
  const user = await requireCompanyAccess(companyId);
  await prisma.person.update({ where: { id: personId }, data: { active } });
  await recordAudit({
    companyId,
    actorUserId: user.id,
    action: active ? "ACTIVATE" : "DEACTIVATE",
    entityType: "Person",
    entityId: personId,
  });
  revalidatePath(`/empresas/${companyId}/pessoas`);
}
