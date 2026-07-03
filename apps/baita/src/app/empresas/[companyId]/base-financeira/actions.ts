"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { DeduplicatorAgent } from "@/agents/deduplicator-agent";
import { ClassifierAgent } from "@/agents/classifier-agent";
import { QualityAuditorAgent } from "@/agents/quality-auditor-agent";
import type { ReliabilityRating } from "@prisma/client";

async function auditEventChange(companyId: string, actorUserId: string, eventId: string, action: string, after: unknown) {
  await recordAudit({ companyId, actorUserId, action, entityType: "FinancialEvent", entityId: eventId, after });
}

export async function setEventCategoryAction(companyId: string, eventId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);
  const managementCategoryId = String(formData.get("managementCategoryId") ?? "") || null;
  await prisma.financialEvent.update({ where: { id: eventId }, data: { managementCategoryId, needsReview: false } });
  await auditEventChange(companyId, user.id, eventId, "SET_CATEGORY", { managementCategoryId });
  revalidatePath(`/empresas/${companyId}/base-financeira`);
}

export async function markAsTransferAction(companyId: string, eventId: string) {
  const user = await requireCompanyAccess(companyId);
  await prisma.financialEvent.update({ where: { id: eventId }, data: { isTransfer: true, eventKind: "TRANSFER" } });
  await auditEventChange(companyId, user.id, eventId, "MARK_TRANSFER", { isTransfer: true });
  revalidatePath(`/empresas/${companyId}/base-financeira`);
}

export async function markAsDuplicateAction(companyId: string, eventId: string) {
  const user = await requireCompanyAccess(companyId);
  await prisma.financialEvent.update({ where: { id: eventId }, data: { isDuplicate: true } });
  await auditEventChange(companyId, user.id, eventId, "MARK_DUPLICATE", { isDuplicate: true });
  revalidatePath(`/empresas/${companyId}/base-financeira`);
}

export async function adjustRatingAction(companyId: string, eventId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);
  const reliabilityRating = String(formData.get("reliabilityRating") ?? "UNKNOWN") as ReliabilityRating;
  await prisma.financialEvent.update({ where: { id: eventId }, data: { reliabilityRating } });
  await auditEventChange(companyId, user.id, eventId, "ADJUST_RATING", { reliabilityRating });
  revalidatePath(`/empresas/${companyId}/base-financeira`);
}

export async function sendForReviewAction(companyId: string, eventId: string) {
  const user = await requireCompanyAccess(companyId);
  await prisma.financialEvent.update({ where: { id: eventId }, data: { needsReview: true } });
  await auditEventChange(companyId, user.id, eventId, "SEND_FOR_REVIEW", { needsReview: true });
  revalidatePath(`/empresas/${companyId}/base-financeira`);
}

export async function createReceivableFromEventAction(companyId: string, eventId: string) {
  const user = await requireCompanyAccess(companyId);
  const event = await prisma.financialEvent.findFirstOrThrow({ where: { id: eventId, companyId } });
  const receivable = await prisma.receivable.create({
    data: {
      companyId,
      customerName: event.counterpartyName ?? "Não identificado",
      amount: event.netAmount,
      dueDate: event.dueDate ?? event.financialDate ?? new Date(),
      sourceEventId: event.id,
      reliabilityRating: event.reliabilityRating,
    },
  });
  await auditEventChange(companyId, user.id, eventId, "CREATE_RECEIVABLE_FROM_EVENT", { receivableId: receivable.id });
  revalidatePath(`/empresas/${companyId}/base-financeira`);
}

export async function createPayableFromEventAction(companyId: string, eventId: string) {
  const user = await requireCompanyAccess(companyId);
  const event = await prisma.financialEvent.findFirstOrThrow({ where: { id: eventId, companyId } });
  const payable = await prisma.payable.create({
    data: {
      companyId,
      supplierName: event.counterpartyName ?? "Não identificado",
      amount: event.netAmount,
      dueDate: event.dueDate ?? event.financialDate ?? new Date(),
      sourceEventId: event.id,
      reliabilityRating: event.reliabilityRating,
    },
  });
  await auditEventChange(companyId, user.id, eventId, "CREATE_PAYABLE_FROM_EVENT", { payableId: payable.id });
  revalidatePath(`/empresas/${companyId}/base-financeira`);
}

export async function runDeduplicatorAction(companyId: string) {
  const user = await requireCompanyAccess(companyId);
  await new DeduplicatorAgent().run({ companyId }, { companyId, actorUserId: user.id });
  revalidatePath(`/empresas/${companyId}/base-financeira`);
}

export async function runClassifierAction(companyId: string) {
  const user = await requireCompanyAccess(companyId);
  await new ClassifierAgent().run({ companyId }, { companyId, actorUserId: user.id });
  revalidatePath(`/empresas/${companyId}/base-financeira`);
}

export async function runQualityAuditorAction(companyId: string) {
  const user = await requireCompanyAccess(companyId);
  await new QualityAuditorAgent().run({ companyId }, { companyId, actorUserId: user.id });
  revalidatePath(`/empresas/${companyId}/base-financeira`);
}
