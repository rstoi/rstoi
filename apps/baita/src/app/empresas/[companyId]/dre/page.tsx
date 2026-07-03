import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { DreTrendChart, type DreTrendPoint } from "@/components/charts/dre-trend-chart";
import { generateDreAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DrePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

  const dres = await prisma.dRE.findMany({
    where: { companyId },
    orderBy: { periodEnd: "asc" },
    include: { lineItems: true },
  });

  const latest = dres[dres.length - 1];
  const generateDre = generateDreAction.bind(null, companyId);

  const trend: DreTrendPoint[] = dres.map((d) => ({
    period: `${formatDate(d.periodStart)}`,
    netRevenue: Number(d.netRevenue),
    ebitda: Number(d.ebitda),
    contributionMargin: Number(d.contributionMargin),
  }));

  const contributionMarginPercent = latest && Number(latest.netRevenue) !== 0 ? Number(latest.contributionMargin) / Number(latest.netRevenue) : 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">DRE Gerencial</h1>
          <p className="mt-1 text-sm text-muted">Demonstração de resultado gerencial por período, com rating de confiabilidade.</p>
        </div>
        <form action={generateDre} className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium">Mês de competência</label>
            <input type="month" name="month" required defaultValue={new Date().toISOString().slice(0, 7)} className="rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <Button type="submit">Gerar DRE</Button>
        </form>
      </div>

      {dres.length > 0 && (
        <Card title="Tendência" className="mb-6">
          <DreTrendChart data={trend} />
        </Card>
      )}

      {latest ? (
        <Card title={`Período: ${formatDate(latest.periodStart)} a ${formatDate(latest.periodEnd)}`}>
          <div className="mb-4 flex items-center gap-2 text-sm text-muted">
            <span>Confiança geral: {formatPercent(Number(latest.confidenceScore))}</span>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              <DreRow label="Receita bruta" value={latest.grossRevenue} />
              <DreRow label="(–) Deduções e impostos sobre vendas" value={latest.salesDeductions} negative />
              <DreRow label="= Receita líquida" value={latest.netRevenue} bold />
              <DreRow label="(–) Custos variáveis" value={latest.variableCosts} negative />
              <DreRow label="= Margem de contribuição" value={latest.contributionMargin} bold hint={formatPercent(contributionMarginPercent)} />
              <DreRow label="(–) Despesas fixas" value={latest.fixedExpenses} negative />
              <DreRow label="= EBITDA gerencial" value={latest.ebitda} bold />
              <DreRow label="(–) Despesas financeiras" value={latest.financialExpenses} negative />
              <DreRow label="(+/–) Itens não recorrentes" value={latest.nonRecurring} />
              <DreRow label="= Resultado gerencial" value={latest.managementResult} bold highlight />
            </tbody>
          </table>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-muted">Nenhum DRE gerado ainda. Classifique os eventos financeiros e gere o DRE do período.</p>
        </Card>
      )}
    </div>
  );
}

function DreRow({
  label,
  value,
  negative,
  bold,
  highlight,
  hint,
}: {
  label: string;
  value: { toString(): string };
  negative?: boolean;
  bold?: boolean;
  highlight?: boolean;
  hint?: string;
}) {
  const numeric = Number(value.toString());
  return (
    <tr className={highlight ? "bg-baita-purple/5" : ""}>
      <td className={`py-2 ${bold ? "font-semibold" : ""}`}>{label}</td>
      <td className={`py-2 text-right tabular-nums ${bold ? "font-semibold" : ""} ${negative ? "text-status-critical" : ""}`}>
        {formatCurrency(numeric)} {hint && <span className="ml-2 text-xs text-muted">({hint})</span>}
      </td>
    </tr>
  );
}
