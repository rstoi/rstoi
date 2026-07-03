import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatPercent } from "@/lib/format";
import { generateReportAction } from "./actions";

export const dynamic = "force-dynamic";

const REPORT_TYPE_LABELS: Record<string, string> = {
  INITIAL_DIAGNOSIS: "Diagnóstico Financeiro Executivo",
  WEEKLY_TREASURY: "Relatório Semanal de Tesouraria",
  MONTHLY_FINANCIAL: "Relatório Mensal Financeiro",
  GOVERNANCE: "Relatório de Governança e Diretoria",
  BACKTESTING: "Relatório de Backtesting",
  EXECUTIVE_SUMMARY: "Resumo Executivo",
  AUDIT: "Relatório de Auditoria",
};

export default async function RelatoriosPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const reports = await prisma.report.findMany({ where: { companyId }, orderBy: { generatedAt: "desc" } });

  const generateReport = generateReportAction.bind(null, companyId);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
      <p className="mt-1 text-sm text-muted">Relatórios executivos HTML, exportáveis para PDF.</p>

      <Card title="Gerar novo relatório" className="mt-6">
        <form action={generateReport} className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium">Tipo de relatório</label>
            <select name="reportType" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              {Object.entries(REPORT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">Gerar</Button>
        </form>
      </Card>

      <Card title="Relatórios gerados" className="mt-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2">Tipo</th>
              <th className="pb-2">Gerado em</th>
              <th className="pb-2">Confiança</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {reports.map((report) => (
              <tr key={report.id}>
                <td className="py-2.5">{report.title}</td>
                <td className="py-2.5 text-muted">{formatDateTime(report.generatedAt)}</td>
                <td className="py-2.5 text-muted">{formatPercent(report.confidenceScore)}</td>
                <td className="py-2.5 text-right">
                  <a
                    href={`/api/empresas/${companyId}/relatorios/${report.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mr-3 text-baita-purple hover:underline"
                  >
                    Ver HTML
                  </a>
                  <a href={`/api/empresas/${companyId}/relatorios/${report.id}/pdf`} className="text-baita-purple hover:underline">
                    Baixar PDF
                  </a>
                </td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted">
                  Nenhum relatório gerado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
