"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { ActionableMessageAgent } from "@/agents/actionable-message-agent";
import type { ReliabilityRating } from "@prisma/client";

export async function setTopicReliabilityAction(
  companyId: string,
  personId: string,
  formData: FormData
) {
  const user = await requireCompanyAccess(companyId);
  const topic = String(formData.get("topic") ?? "").trim();
  const rating = String(formData.get("rating") ?? "UNKNOWN") as ReliabilityRating;
  if (!topic) throw new Error("Tema é obrigatório.");

  await prisma.personTopicReliability.upsert({
    where: { personId_topic: { personId, topic } },
    create: { personId, topic, rating },
    update: { rating },
  });

  await recordAudit({
    companyId,
    actorUserId: user.id,
    action: "SET_TOPIC_RELIABILITY",
    entityType: "PersonTopicReliability",
    entityId: personId,
    after: { topic, rating },
  });

  revalidatePath(`/empresas/${companyId}/pessoas/${personId}`);
}

export async function generateAccountantRequestAction(
  companyId: string,
  personId: string,
  formData: FormData
) {
  await requireCompanyAccess(companyId);
  const competence = String(formData.get("competence") ?? "");
  const items = String(formData.get("items") ?? "")
    .split(",")
    .map((i) => i.trim())
    .filter(Boolean);

  const result = await new ActionableMessageAgent().run({
    kind: "ACCOUNTANT_REQUEST",
    personId,
    competence,
    items,
  });

  await prisma.humanInteraction.create({
    data: {
      companyId,
      personId,
      channel: "E-mail",
      purpose: "Solicitação de documentos contábeis",
      messageText: result.output.message,
    },
  });

  revalidatePath(`/empresas/${companyId}/pessoas/${personId}`);
}
