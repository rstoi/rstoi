"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { getFileStorage } from "@/lib/file-storage";
import { ExtractorAgent } from "@/agents/extractor-agent";
import { NormalizerAgent } from "@/agents/normalizer-agent";
import type { ProcessingStatus } from "@prisma/client";

export async function processFileAction(companyId: string, fileId: string) {
  const user = await requireCompanyAccess(companyId);

  const file = await prisma.uploadedFile.findFirstOrThrow({
    where: { id: fileId, companyId },
    include: { dataSource: true },
  });

  await prisma.uploadedFile.update({ where: { id: fileId }, data: { processingStatus: "PROCESSING" } });

  const storage = getFileStorage();
  const content = await storage.read(file.storedPath);

  const extraction = await new ExtractorAgent().run(
    { fileName: file.originalFileName, mimeType: file.mimeType, content },
    { companyId, actorUserId: user.id, rationale: `Extração do arquivo ${file.originalFileName}.` }
  );

  const sourceType = file.dataSource?.type ?? "OTHER";

  const normalization = await new NormalizerAgent().run(
    { sourceType, rows: extraction.output.rows },
    { companyId, actorUserId: user.id, rationale: "Normalização de linhas extraídas." }
  );

  const extractedDocument = await prisma.extractedDocument.create({
    data: {
      companyId,
      uploadedFileId: file.id,
      documentType: extraction.output.documentType,
      extractedJson: extraction.output.rows as never,
      extractionNotes: extraction.warnings.map((w) => w.message).join(" | ") || null,
      confidence: extraction.confidence,
    },
  });

  let createdEvents = 0;
  let needsReviewCount = 0;

  for (const candidate of normalization.output.candidates) {
    const needsReview = !candidate.financialDate || candidate.grossAmount === 0;
    if (needsReview) needsReviewCount++;

    await prisma.financialEvent.create({
      data: {
        companyId,
        sourceType,
        sourceId: file.dataSourceId,
        extractedDocumentId: extractedDocument.id,
        eventKind: sourceType === "BANK_STATEMENT" ? (candidate.netAmount >= 0 ? "CASH_IN" : "CASH_OUT") : "UNKNOWN",
        financialDate: candidate.financialDate ? new Date(candidate.financialDate) : null,
        grossAmount: candidate.grossAmount,
        netAmount: candidate.netAmount,
        counterpartyName: candidate.counterpartyName,
        originalDescription: candidate.originalDescription,
        normalizedDescription: candidate.normalizedDescription,
        needsReview,
      },
    });
    createdEvents++;
  }

  const hasErrors = extraction.errors.length > 0;
  const hasWarnings = extraction.warnings.length > 0 || normalization.warnings.length > 0 || needsReviewCount > 0;

  const finalStatus: ProcessingStatus = hasErrors
    ? "FAILED"
    : needsReviewCount === createdEvents && createdEvents > 0
      ? "NEEDS_REVIEW"
      : hasWarnings
        ? "PROCESSED_WITH_WARNINGS"
        : "PROCESSED";

  await prisma.uploadedFile.update({
    where: { id: fileId },
    data: {
      processingStatus: finalStatus,
      extractionConfidence: extraction.confidence,
      processingNotes: [...extraction.warnings, ...normalization.warnings].map((w) => w.message).join(" | ") || null,
    },
  });

  await recordAudit({
    companyId,
    actorUserId: user.id,
    action: "PROCESS",
    entityType: "UploadedFile",
    entityId: fileId,
    after: { createdEvents, needsReviewCount, finalStatus },
    rationale: "Processamento de arquivo (extração + normalização).",
  });

  revalidatePath(`/empresas/${companyId}/arquivos`);
}
