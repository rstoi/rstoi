import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/auth";
import { getFileStorage } from "@/lib/file-storage";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Upload de arquivos financeiros/operacionais. Implementado como Route
 * Handler (não Server Action) para lidar com uploads binários multipart sem
 * o limite padrão de tamanho de corpo aplicado a Server Actions.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await ctx.params;
  const user = await requireCompanyAccess(companyId);

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const dataSourceId = String(formData.get("dataSourceId") ?? "") || null;
  const periodStartRaw = String(formData.get("periodStart") ?? "");
  const periodEndRaw = String(formData.get("periodEnd") ?? "");

  if (files.length === 0) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }

  const storage = getFileStorage();

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storage.save(companyId, file.name, buffer);

    const uploaded = await prisma.uploadedFile.create({
      data: {
        companyId,
        dataSourceId,
        originalFileName: file.name,
        storedPath: stored.storedPath,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: stored.sizeBytes,
        hash: stored.hash,
        periodStart: periodStartRaw ? new Date(periodStartRaw) : null,
        periodEnd: periodEndRaw ? new Date(periodEndRaw) : null,
        uploadedById: user.id,
        processingStatus: "UPLOADED",
      },
    });

    await recordAudit({
      companyId,
      actorUserId: user.id,
      action: "UPLOAD",
      entityType: "UploadedFile",
      entityId: uploaded.id,
      after: { originalFileName: file.name, sizeBytes: stored.sizeBytes, hash: stored.hash },
      rationale: "Upload de arquivo financeiro/operacional.",
    });
  }

  const redirectUrl = new URL(`/empresas/${companyId}/arquivos`, request.url);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
