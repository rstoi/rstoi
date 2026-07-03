import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ companyId: string; reportId: string }> }
) {
  const { companyId, reportId } = await ctx.params;
  await requireCompanyAccess(companyId);

  const report = await prisma.report.findFirst({ where: { id: reportId, companyId } });
  if (!report) {
    return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  }

  return new NextResponse(report.htmlContent, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
