/**
 * BacktestingAgent — compara um forecast anterior contra o realizado no
 * mesmo período, persistindo BacktestingRun + BacktestingLine.
 */
import { format } from "date-fns";
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { runBacktesting } from "@/lib/backtesting-service";
import { prisma } from "@/lib/prisma";

export type BacktestingAgentInput = { companyId: string; forecastId: string };
export type BacktestingAgentOutput = {
  backtestingRunId: string;
  accuracyScore: number;
  bias: string;
};

export class BacktestingAgent extends BaseAgent<BacktestingAgentInput, BacktestingAgentOutput> {
  readonly name = "BacktestingAgent";
  readonly version = "1.0.0";
  readonly description = "Compara forecast anterior contra realizado e calcula erro/viés.";

  protected async execute(input: BacktestingAgentInput): Promise<AgentRunResult<BacktestingAgentOutput>> {
    const forecast = await prisma.forecast.findUniqueOrThrow({
      where: { id: input.forecastId },
      include: { lines: { orderBy: { date: "asc" } } },
    });

    const realizedEvents = await prisma.financialEvent.findMany({
      where: {
        companyId: input.companyId,
        isDuplicate: false,
        financialDate: { gte: forecast.horizonStart, lte: forecast.horizonEnd },
        eventKind: { in: ["CASH_IN", "CASH_OUT"] },
      },
    });

    const realizedByDate = new Map<string, number>();
    for (const event of realizedEvents) {
      const key = format(event.financialDate!, "yyyy-MM-dd");
      const amount = Number(event.netAmount) * (event.eventKind === "CASH_IN" ? 1 : -1);
      realizedByDate.set(key, (realizedByDate.get(key) ?? 0) + amount);
    }

    const pairs = forecast.lines.map((line) => {
      const dateKey = format(line.date, "yyyy-MM-dd");
      const predictedNetFlow =
        Number(line.confirmedInflows) +
        Number(line.probableInflows) +
        Number(line.possibleInflows) -
        Number(line.mandatoryOutflows) -
        Number(line.renegotiableOutflows) -
        Number(line.deferrableOutflows);
      return {
        date: dateKey,
        category: "Fluxo diário",
        predictedAmount: predictedNetFlow,
        actualAmount: realizedByDate.get(dateKey) ?? 0,
      };
    });

    const summary = runBacktesting(pairs);

    const run = await prisma.backtestingRun.create({
      data: {
        companyId: input.companyId,
        forecastId: input.forecastId,
        periodStart: forecast.horizonStart,
        periodEnd: forecast.horizonEnd,
        totalAbsoluteError: summary.totalAbsoluteError,
        totalPercentageError: summary.totalPercentageError,
        bias: summary.bias,
        accuracyScore: summary.accuracyScore,
      },
    });

    await prisma.backtestingLine.createMany({
      data: summary.lines.map((line) => ({
        backtestingRunId: run.id,
        date: new Date(line.date),
        category: line.category,
        predictedAmount: line.predictedAmount,
        actualAmount: line.actualAmount,
        absoluteError: line.absoluteError,
        percentageError: line.percentageError,
        cause: line.cause,
        adjustmentRecommendation: line.adjustmentRecommendation,
      })),
    });

    const warnings: AgentRunResult<BacktestingAgentOutput>["warnings"] = [];
    if (summary.bias !== "NEUTRO") {
      warnings.push({
        code: "FORECAST_BIAS",
        message: `Viés ${summary.bias} identificado — ajustar premissas do próximo forecast.`,
      });
    }

    return {
      output: { backtestingRunId: run.id, accuracyScore: summary.accuracyScore, bias: summary.bias },
      confidence: summary.accuracyScore,
      warnings,
      errors: [],
      ruleBasedMode: true,
    };
  }
}
