"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { DirectorEvaluationAgent } from "@/agents/director-evaluation-agent";
import { DIMENSION_CRITERIA, type CriterionScore, type EvaluationDimensionKey } from "@/lib/director-evaluation-service";
import type { GovernanceRitualType } from "@prisma/client";

export async function createRitualAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);
  const ritual = await prisma.governanceRitual.create({
    data: {
      companyId,
      name: String(formData.get("name") ?? "").trim(),
      type: (String(formData.get("type") ?? "OTHER") as GovernanceRitualType) || "OTHER",
      frequency: String(formData.get("frequency") ?? "MONTHLY"),
      agendaTemplate: String(formData.get("agendaTemplate") ?? "") || null,
      ownerPersonId: String(formData.get("ownerPersonId") ?? "") || null,
    },
  });
  await recordAudit({ companyId, actorUserId: user.id, action: "CREATE", entityType: "GovernanceRitual", entityId: ritual.id });
  revalidatePath(`/empresas/${companyId}/governanca`);
}

export async function createMeetingAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);
  const meeting = await prisma.meetingRecord.create({
    data: {
      companyId,
      ritualId: String(formData.get("ritualId") ?? "") || null,
      date: new Date(String(formData.get("date") ?? new Date().toISOString())),
      title: String(formData.get("title") ?? "").trim(),
      agenda: String(formData.get("agenda") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
    },
  });
  await recordAudit({ companyId, actorUserId: user.id, action: "CREATE", entityType: "MeetingRecord", entityId: meeting.id });
  revalidatePath(`/empresas/${companyId}/governanca`);
}

export async function submitDirectorEvaluationAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);

  const periodStart = new Date(String(formData.get("periodStart")));
  const periodEnd = new Date(String(formData.get("periodEnd")));

  const scores: CriterionScore[] = [];
  for (const [dimension, criteria] of Object.entries(DIMENSION_CRITERIA)) {
    for (const criterion of criteria) {
      const key = `${dimension}::${criterion}`;
      const raw = formData.get(key);
      if (raw && String(raw).trim() !== "") {
        scores.push({ dimension: dimension as EvaluationDimensionKey, criterion, score: Number(raw) });
      }
    }
  }

  await new DirectorEvaluationAgent().run(
    { companyId, periodStart, periodEnd, scores, notes: String(formData.get("notes") ?? "") || undefined },
    { companyId, actorUserId: user.id, rationale: "Avaliação de diretoria nas oito dimensões." }
  );

  revalidatePath(`/empresas/${companyId}/governanca`);
}
