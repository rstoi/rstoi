import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { FORECAST_SCENARIO_LABELS } from "@/lib/labels";
import { runBacktestingAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function BacktestingPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [forecasts, runs] = await Promise.all([
    prisma.forecast.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.backtestingRun.findMany({
      where: { companyId },
      orderBy: { runDate: "desc" },
      include: { lines: { orderBy: { date: "asc" } }, forecast: true },
      take: 5,
    }),
  ]);

  const runBacktesting = runBacktestingAction.bind(null, companyId);
  const latest = runs[0];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Backtesting</h1>
      <p className="mt-1 text-sm text-muted">Compara o forecast anterior com o fluxo realizado no mesmo período.</p>

      <Card title="Rodar novo backtesting" className="mt-6">
        <form action={runBacktesting} className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium">Forecast</label>
            <select name="forecastId" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              {forecasts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} — {formatDate(f.horizonStart)} a {formatDate(f.horizonEnd)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">Rodar backtesting</Button>
        </form>
      </Card>

      {latest && (
        <Card title={`Resultado mais recente: ${latest.forecast.name}`} className="mt-6">
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <span>Erro absoluto total: <strong>{formatCurrency(latest.totalAbsoluteError.toString())}</strong></span>
            <span>Erro percentual: <strong>{formatPercent(latest.totalPercentageError)}</strong></span>
            <span>
              Viés:{" "}
              <Badge color={latest.bias === "NEUTRO" ? "green" : latest.bias === "PESSIMISTA" ? "yellow" : "red"}>
                {latest.bias}
              </Badge>
            </span>
            <span>Acurácia: <strong>{formatPercent(latest.accuracyScore)}</strong></span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2">Data</th>
                <th className="pb-2">Previsto</th>
                <th className="pb-2">Realizado</th>
                <th className="pb-2">Erro</th>
                <th className="pb-2">Causa provável</th>
                <th className="pb-2">Ajuste recomendado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {latest.lines.slice(0, 15).map((line) => (
                <tr key={line.id}>
                  <td className="whitespace-nowrap py-2 pr-3">{formatDate(line.date)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{formatCurrency(line.predictedAmount.toString())}</td>
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{formatCurrency(line.actualAmount.toString())}</td>
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{formatPercent(line.percentageError)}</td>
                  <td className="py-2 pr-3 text-muted">{line.cause}</td>
                  <td className="py-2 text-muted">{line.adjustmentRecommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="Histórico de execuções" className="mt-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2">Data</th>
              <th className="pb-2">Forecast</th>
              <th className="pb-2">Cenário</th>
              <th className="pb-2">Acurácia</th>
              <th className="pb-2">Viés</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="py-2">{formatDate(run.runDate)}</td>
                <td className="py-2">{run.forecast.name}</td>
                <td className="py-2">{FORECAST_SCENARIO_LABELS[run.forecast.scenario]}</td>
                <td className="py-2">{formatPercent(run.accuracyScore)}</td>
                <td className="py-2">{run.bias}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-muted">
                  Nenhum backtesting rodado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
