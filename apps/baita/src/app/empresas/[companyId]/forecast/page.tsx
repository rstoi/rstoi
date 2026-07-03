import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { FORECAST_SCENARIO_LABELS } from "@/lib/labels";
import { ForecastChart, type ForecastChartPoint } from "@/components/charts/forecast-chart";
import { aggregateMonthly } from "@/lib/forecast-service";
import type { ForecastScenario } from "@prisma/client";
import { generateForecastAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ForecastPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ scenario?: string }>;
}) {
  const { companyId } = await params;
  const { scenario: scenarioParam } = await searchParams;
  const scenario = (scenarioParam as ForecastScenario) ?? "BASE";

  const forecasts = await prisma.forecast.findMany({
    where: { companyId, scenario },
    orderBy: { createdAt: "desc" },
    include: { lines: { orderBy: { date: "asc" } } },
    take: 20,
  });

  // Entre forecasts do mesmo cenário, prioriza o que ainda está "vigente"
  // (horizonte não totalmente no passado) sobre execuções históricas mais
  // recentes usadas apenas para backtesting.
  const now = new Date();
  const isCurrent = (f: (typeof forecasts)[number]) => f.horizonEnd >= now;
  const dailyCandidates = forecasts.filter((f) => f.lines.length <= 32);
  const yearlyCandidates = forecasts.filter((f) => f.lines.length > 32);
  const dailyForecast = dailyCandidates.find(isCurrent) ?? dailyCandidates[0];
  const yearlyForecast = yearlyCandidates.find(isCurrent) ?? yearlyCandidates[0];

  const generateForecast = generateForecastAction.bind(null, companyId);

  const dailyChartData: ForecastChartPoint[] =
    dailyForecast?.lines.map((l) => ({ date: formatDate(l.date), closingBalance: Number(l.closingBalance) })) ?? [];

  const lowestDaily = dailyForecast?.lines.reduce(
    (lowest, l) => (Number(l.closingBalance) < Number(lowest.closingBalance) ? l : lowest),
    dailyForecast.lines[0]
  );

  const monthlyAgg = yearlyForecast
    ? aggregateMonthly(
        yearlyForecast.lines.map((l) => ({
          date: l.date.toISOString().slice(0, 10),
          openingBalance: Number(l.openingBalance),
          confirmedInflows: Number(l.confirmedInflows),
          probableInflows: Number(l.probableInflows),
          possibleInflows: Number(l.possibleInflows),
          mandatoryOutflows: Number(l.mandatoryOutflows),
          renegotiableOutflows: Number(l.renegotiableOutflows),
          deferrableOutflows: Number(l.deferrableOutflows),
          closingBalance: Number(l.closingBalance),
          confidence: l.confidence,
        }))
      )
    : [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Forecast</h1>
          <p className="mt-1 text-sm text-muted">Fluxo de caixa diário (30 dias) e projeção mensal até dezembro.</p>
        </div>
        <form action={generateForecast} className="flex items-end gap-2">
          <input type="hidden" name="scenario" value={scenario} />
          <div>
            <label className="mb-1 block text-xs font-medium">Horizonte</label>
            <select name="horizon" className="rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              <option value="30_DAYS">30 dias</option>
              <option value="END_OF_YEAR">Até dezembro</option>
            </select>
          </div>
          <Button type="submit">Gerar forecast ({FORECAST_SCENARIO_LABELS[scenario]})</Button>
        </form>
      </div>

      <div className="mb-4 flex gap-2 text-sm">
        {(["CONSERVATIVE", "BASE", "OPTIMISTIC"] as const).map((s) => (
          <a
            key={s}
            href={`?scenario=${s}`}
            className={`rounded-md px-3 py-1 ${scenario === s ? "bg-baita-purple text-white" : "border border-border"}`}
          >
            {FORECAST_SCENARIO_LABELS[s]}
          </a>
        ))}
      </div>

      {dailyForecast ? (
        <Card title="Fluxo de caixa diário (30 dias)" className="mb-6">
          <div className="mb-3 flex gap-6 text-sm">
            <span>
              Menor saldo projetado:{" "}
              <strong className={lowestDaily && Number(lowestDaily.closingBalance) < 0 ? "text-status-critical" : ""}>
                {lowestDaily ? formatCurrency(Number(lowestDaily.closingBalance)) : "—"}
              </strong>
            </span>
            <span>Data de risco: {lowestDaily ? formatDate(lowestDaily.date) : "—"}</span>
            <span>Confiança: {Math.round(dailyForecast.confidenceScore * 100)}%</span>
          </div>
          <ForecastChart data={dailyChartData} />
        </Card>
      ) : (
        <Card className="mb-6">
          <p className="text-sm text-muted">Nenhum forecast diário gerado para este cenário ainda.</p>
        </Card>
      )}

      {yearlyForecast && (
        <Card title="Projeção mensal até dezembro">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2">Mês</th>
                <th className="pb-2">Fluxo líquido</th>
                <th className="pb-2">Saldo final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {monthlyAgg.map((m) => (
                <tr key={m.month}>
                  <td className="py-2">{m.month}</td>
                  <td className="py-2">{formatCurrency(m.netFlow)}</td>
                  <td className={`py-2 ${m.closingBalance < 0 ? "text-status-critical" : ""}`}>{formatCurrency(m.closingBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
