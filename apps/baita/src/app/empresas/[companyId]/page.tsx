import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TreasuryAgent } from "@/agents/treasury-agent";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { ADIZES_STAGE_LABELS, CRITICALITY_LABELS, RECOMMENDATION_AREA_LABELS } from "@/lib/labels";
import { LIQUIDITY_RISK_LABELS, TREASURY_SITUATION_LABELS } from "@/lib/treasury-service";

export const dynamic = "force-dynamic";

export default async function CompanyDashboardPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

  const [company, lastDre, lastForecast, lastDirectorEvaluation, criticalRecommendations] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    prisma.dRE.findFirst({ where: { companyId }, orderBy: { periodEnd: "desc" } }),
    prisma.forecast.findFirst({
      where: { companyId, scenario: "CONSERVATIVE" },
      orderBy: { createdAt: "desc" },
      include: { lines: { orderBy: { date: "asc" } } },
    }),
    prisma.directorEvaluation.findFirst({ where: { companyId }, orderBy: { periodEnd: "desc" } }),
    prisma.recommendation.findMany({
      where: { companyId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: [{ urgency: "desc" }, { createdAt: "desc" }],
      take: 5,
    }),
  ]);

  const treasuryResult = await new TreasuryAgent().run({ companyId });
  const treasury = treasuryResult.output;

  const lowestBalanceLine = lastForecast?.lines.reduce(
    (lowest, line) => (Number(line.closingBalance) < Number(lowest.closingBalance) ? line : lowest),
    lastForecast.lines[0]
  );

  const liquidityStatus =
    treasury.liquidityRisk === "LOW" ? "good" : treasury.liquidityRisk === "MEDIUM" ? "warning" : "critical";

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
          <p className="text-sm text-muted">
            Situação: <strong>{TREASURY_SITUATION_LABELS[treasury.situation]}</strong> · Estágio Adizes:{" "}
            {ADIZES_STAGE_LABELS[company.lifecycleStageAdizes]}
          </p>
        </div>
        <Link href={`/empresas/${companyId}/relatorios`} className="text-sm font-medium text-baita-purple hover:underline">
          Gerar relatório executivo →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Caixa livre" value={formatCurrency(treasury.freeCash)} status={treasury.freeCash >= 0 ? "good" : "critical"} />
        <StatCard
          label="Menor saldo projetado (30d)"
          value={lowestBalanceLine ? formatCurrency(Number(lowestBalanceLine.closingBalance)) : "—"}
          hint={lowestBalanceLine ? formatDate(lowestBalanceLine.date) : "Sem forecast gerado"}
          status={lowestBalanceLine && Number(lowestBalanceLine.closingBalance) < 0 ? "critical" : "good"}
        />
        <StatCard
          label="Risco de liquidez"
          value={LIQUIDITY_RISK_LABELS[treasury.liquidityRisk]}
          status={liquidityStatus}
        />
        <StatCard
          label="Receita líquida do mês"
          value={lastDre ? formatCurrency(lastDre.netRevenue.toString()) : "—"}
          hint={lastDre ? `${formatDate(lastDre.periodStart)} – ${formatDate(lastDre.periodEnd)}` : "Sem DRE gerado"}
        />
        <StatCard
          label="EBITDA gerencial"
          value={lastDre ? formatCurrency(lastDre.ebitda.toString()) : "—"}
          status={lastDre && Number(lastDre.ebitda) >= 0 ? "good" : "critical"}
        />
        <StatCard
          label="Margem de contribuição"
          value={lastDre ? formatCurrency(lastDre.contributionMargin.toString()) : "—"}
        />
        <StatCard
          label="Contas a receber vencidas"
          value={formatCurrency(treasury.receivablesOverdue)}
          status={treasury.receivablesOverdue > 0 ? "warning" : "good"}
        />
        <StatCard
          label="Contas a pagar vencidas"
          value={formatCurrency(treasury.payablesOverdue)}
          status={treasury.payablesOverdue > 0 ? "critical" : "good"}
        />
        <StatCard label="Dívida total" value={formatCurrency(treasury.totalDebt)} />
        <StatCard label="Serviço da dívida mensal" value={formatCurrency(treasury.monthlyDebtService)} />
        <StatCard
          label="Score de confiabilidade (DRE)"
          value={lastDre ? `${Math.round(Number(lastDre.confidenceScore) * 100)}%` : "—"}
        />
        <StatCard
          label="Maturidade da diretoria"
          value={lastDirectorEvaluation ? lastDirectorEvaluation.totalScore.toFixed(1) : "—"}
          hint="Escala de 1 a 5"
        />
      </div>

      <Card title="Recomendações críticas" className="mt-6">
        {criticalRecommendations.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma recomendação em aberto no momento.</p>
        ) : (
          <ul className="divide-y divide-border">
            {criticalRecommendations.map((rec) => (
              <li key={rec.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium">{rec.title}</p>
                  <p className="text-xs text-muted">{RECOMMENDATION_AREA_LABELS[rec.area]}</p>
                </div>
                <Badge color={rec.urgency === "CRITICAL" || rec.urgency === "HIGH" ? "red" : "yellow"}>
                  {CRITICALITY_LABELS[rec.urgency]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/empresas/${companyId}/recomendacoes`}
          className="mt-3 inline-block text-sm font-medium text-baita-purple hover:underline"
        >
          Ver todas as recomendações →
        </Link>
      </Card>
    </div>
  );
}
