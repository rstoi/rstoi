"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import type { ReliabilityRating } from "@prisma/client";

function path(companyId: string) {
  return `/empresas/${companyId}/situacao-financeira`;
}

export async function createReceivableAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);
  const receivable = await prisma.receivable.create({
    data: {
      companyId,
      customerName: String(formData.get("customerName") ?? "").trim(),
      amount: parseFloat(String(formData.get("amount") ?? "0")),
      dueDate: new Date(String(formData.get("dueDate") ?? new Date().toISOString())),
      probability: parseFloat(String(formData.get("probability") ?? "1")),
      reliabilityRating: (String(formData.get("reliabilityRating") ?? "UNKNOWN") as ReliabilityRating) || "UNKNOWN",
    },
  });
  await recordAudit({ companyId, actorUserId: user.id, action: "CREATE", entityType: "Receivable", entityId: receivable.id });
  revalidatePath(path(companyId));
}

export async function createPayableAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);
  const payable = await prisma.payable.create({
    data: {
      companyId,
      supplierName: String(formData.get("supplierName") ?? "").trim(),
      amount: parseFloat(String(formData.get("amount") ?? "0")),
      dueDate: new Date(String(formData.get("dueDate") ?? new Date().toISOString())),
      criticality: (String(formData.get("criticality") ?? "MEDIUM") as never) || "MEDIUM",
      renegotiable: formData.get("renegotiable") === "on",
      reliabilityRating: (String(formData.get("reliabilityRating") ?? "UNKNOWN") as ReliabilityRating) || "UNKNOWN",
    },
  });
  await recordAudit({ companyId, actorUserId: user.id, action: "CREATE", entityType: "Payable", entityId: payable.id });
  revalidatePath(path(companyId));
}

export async function createDebtAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);
  const debt = await prisma.debt.create({
    data: {
      companyId,
      creditorName: String(formData.get("creditorName") ?? "").trim(),
      debtType: String(formData.get("debtType") ?? "").trim(),
      principalBalance: parseFloat(String(formData.get("principalBalance") ?? "0")),
      interestRateMonthly: formData.get("interestRateMonthly") ? parseFloat(String(formData.get("interestRateMonthly"))) : null,
      installmentAmount: formData.get("installmentAmount") ? parseFloat(String(formData.get("installmentAmount"))) : null,
      nextDueDate: formData.get("nextDueDate") ? new Date(String(formData.get("nextDueDate"))) : null,
      reliabilityRating: (String(formData.get("reliabilityRating") ?? "UNKNOWN") as ReliabilityRating) || "UNKNOWN",
    },
  });
  await recordAudit({ companyId, actorUserId: user.id, action: "CREATE", entityType: "Debt", entityId: debt.id });
  revalidatePath(path(companyId));
}

export async function createTaxObligationAction(companyId: string, formData: FormData) {
  const user = await requireCompanyAccess(companyId);
  const tax = await prisma.taxObligation.create({
    data: {
      companyId,
      taxType: String(formData.get("taxType") ?? "").trim(),
      competence: String(formData.get("competence") ?? "").trim(),
      amount: parseFloat(String(formData.get("amount") ?? "0")),
      dueDate: new Date(String(formData.get("dueDate") ?? new Date().toISOString())),
      reliabilityRating: (String(formData.get("reliabilityRating") ?? "UNKNOWN") as ReliabilityRating) || "UNKNOWN",
    },
  });
  await recordAudit({ companyId, actorUserId: user.id, action: "CREATE", entityType: "TaxObligation", entityId: tax.id });
  revalidatePath(path(companyId));
}
