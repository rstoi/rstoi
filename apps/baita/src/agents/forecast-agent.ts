/**
 * ForecastAgent — projeta fluxo de caixa diário para 30 dias e mensal até o
 * fim do ano, nos três cenários (conservador, base, otimista), a partir de
 * recebíveis, contas a pagar, dívidas e impostos cadastrados.
 */
import { addDays, differenceInCalendarDays, endOfYear, format } from "date-fns";
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { buildDailyForecast, findLowestBalance, type CashFlowItem } from "@/lib/forecast-service";
import { prisma } from "@/lib/prisma";
import type { ForecastScenario } from "@prisma/client";

export type ForecastAgentInput = {
  companyId: string;
  startingBalance: number;
  scenario: ForecastScenario;
  horizonDays?: number; // padrão 30 dias; para o mensal até dezembro, usar horizonEndOfYear
  horizonEndOfYear?: boolean;
  referenceDate?: Date;
};

export type ForecastAgentOutput = {
  forecastId: string;
  lowestBalance: { date: string; balance: number } | null;
  confidenceScore: number;
};

export class ForecastAgent extends BaseAgent<ForecastAgentInput, ForecastAgentOutput> {
  readonly name = "ForecastAgent";
  readonly version = "1.0.0";
  readonly description = "Gera forecast de fluxo de caixa diário e mensal por cenário.";

  protected async execute(input: ForecastAgentInput): Promise<AgentRunResult<ForecastAgentOutput>> {
    const referenceDate = input.referenceDate ?? new Date();
    const horizonEnd = input.horizonEndOfYear
      ? endOfYear(referenceDate)
      : addDays(referenceDate, input.horizonDays ?? 30);
    const totalDays = Math.max(1, differenceInCalendarDays(horizonEnd, referenceDate));
    const dates = Array.from({ length: totalDays + 1 }, (_, i) => format(addDays(referenceDate, i), "yyyy-MM-dd"));

    const [receivables, payables, debts, taxes] = await Promise.all([
      prisma.receivable.findMany({
        where: { companyId: input.companyId, status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] } },
      }),
      prisma.payable.findMany({
        where: { companyId: input.companyId, status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] } },
      }),
      prisma.debt.findMany({ where: { companyId: input.companyId, nextDueDate: { not: null } } }),
      prisma.taxObligation.findMany({ where: { companyId: input.companyId, status: { in: ["OPEN", "OVERDUE"] } } }),
    ]);

    const inflows: CashFlowItem[] = receivables
      .filter((r) => r.dueDate >= referenceDate && r.dueDate <= horizonEnd)
      .map((r) => ({
        date: format(r.expectedPaymentDate ?? r.dueDate, "yyyy-MM-dd"),
        amount: Number(r.amount) * r.probability,
        rating: r.reliabilityRating,
      }));

    const outflows: CashFlowItem[] = [
      ...payables
        .filter((p) => p.dueDate >= referenceDate && p.dueDate <= horizonEnd)
        .map((p) => ({
          date: format(p.dueDate, "yyyy-MM-dd"),
          amount: Number(p.amount),
          rating: p.reliabilityRating,
          outflowKind: (p.renegotiable ? "RENEGOTIABLE" : "MANDATORY") as CashFlowItem["outflowKind"],
        })),
      ...debts
        .filter((d) => d.nextDueDate && d.nextDueDate >= referenceDate && d.nextDueDate <= horizonEnd)
        .map((d) => ({
          date: format(d.nextDueDate!, "yyyy-MM-dd"),
          amount: Number(d.installmentAmount ?? 0),
          rating: d.reliabilityRating,
          outflowKind: "MANDATORY" as CashFlowItem["outflowKind"],
        })),
      ...taxes
        .filter((t) => t.dueDate >= referenceDate && t.dueDate <= horizonEnd)
        .map((t) => ({
          date: format(t.dueDate, "yyyy-MM-dd"),
          amount: Number(t.amount),
          rating: t.reliabilityRating,
          outflowKind: "MANDATORY" as CashFlowItem["outflowKind"],
        })),
    ];

    const lines = buildDailyForecast({
      startingBalance: input.startingBalance,
      dates,
      inflows,
      outflows,
      scenario: input.scenario,
    });

    const lowestBalance = findLowestBalance(lines);
    const confidenceScore = lines.length > 0 ? lines.reduce((s, l) => s + l.confidence, 0) / lines.length : 0;

    const forecast = await prisma.forecast.create({
      data: {
        companyId: input.companyId,
        name: input.horizonEndOfYear
          ? `Projeção mensal até dezembro (${input.scenario})`
          : `Fluxo de caixa 30 dias (${input.scenario})`,
        horizonStart: referenceDate,
        horizonEnd,
        scenario: input.scenario,
        assumptionsJson: {
          inflowsCount: inflows.length,
          outflowsCount: outflows.length,
        },
        confidenceScore,
      },
    });

    await prisma.forecastLine.createMany({
      data: lines.map((line) => ({
        forecastId: forecast.id,
        date: new Date(line.date),
        openingBalance: line.openingBalance,
        confirmedInflows: line.confirmedInflows,
        probableInflows: line.probableInflows,
        possibleInflows: line.possibleInflows,
        mandatoryOutflows: line.mandatoryOutflows,
        renegotiableOutflows: line.renegotiableOutflows,
        deferrableOutflows: line.deferrableOutflows,
        closingBalance: line.closingBalance,
        confidence: line.confidence,
      })),
    });

    const warnings: AgentRunResult<ForecastAgentOutput>["warnings"] = [];
    if (lowestBalance && lowestBalance.balance < 0) {
      warnings.push({
        code: "NEGATIVE_BALANCE_RISK",
        message: `Risco de saldo negativo em ${lowestBalance.date}: ${lowestBalance.balance.toFixed(2)}.`,
      });
    }

    return {
      output: { forecastId: forecast.id, lowestBalance, confidenceScore },
      confidence: confidenceScore,
      warnings,
      errors: [],
      ruleBasedMode: true,
    };
  }
}
