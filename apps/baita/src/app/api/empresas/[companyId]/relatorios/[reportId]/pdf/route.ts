import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/auth";
import { getFileStorage } from "@/lib/file-storage";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Exporta um relatório já gerado para PDF via Playwright/Chromium,
 * mantendo o HTML como fonte de verdade (impressão print-friendly).
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ companyId: string; reportId: string }> }
) {
  const { companyId, reportId } = await ctx.params;
  const user = await requireCompanyAccess(companyId);

  const report = await prisma.report.findFirst({ where: { id: reportId, companyId } });
  if (!report) {
    return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  }

  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({ executablePath });
  try {
    const page = await browser.newPage();
    await page.setContent(report.htmlContent, { waitUntil: "networkidle" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", bottom: "0" } });

    const storage = getFileStorage();
    const stored = await storage.save(companyId, `${report.reportType}-${report.id}.pdf`, Buffer.from(pdfBuffer));

    await prisma.report.update({ where: { id: report.id }, data: { pdfPath: stored.storedPath } });
    await recordAudit({
      companyId,
      actorUserId: user.id,
      action: "EXPORT_PDF",
      entityType: "Report",
      entityId: report.id,
      rationale: "Exportação de relatório para PDF.",
    });

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${report.reportType}-${report.id}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
