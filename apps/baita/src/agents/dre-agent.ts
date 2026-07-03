/**
 * DREAgent — gera o DRE gerencial de um período a partir dos eventos
 * financeiros classificados, persistindo DRE + DRELineItem.
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { calculateDre } from "@/lib/dre-service";
import { prisma } from "@/lib/prisma";
import { ratingForecastInclusion } from "@/lib/rating-service";

export type DreAgentInput = {
  companyId: string;
  periodStart: Date;
  periodEnd: Date;
};

export type DreAgentOutput = {
  dreId: string;
  managementResult: number;
  confidenceScore: number;
};

export class DREAgent extends BaseAgent<DreAgentInput, DreAgentOutput> {
  readonly name = "DREAgent";
  readonly version = "1.0.0";
  readonly description = "Gera o DRE gerencial de um período.";

  protected async execute(input: DreAgentInput): Promise<AgentRunResult<DreAgentOutput>> {
    const events = await prisma.financialEvent.findMany({
      where: {
        companyId: input.companyId,
        isDuplicate: false,
        financialDate: { gte: input.periodStart, lte: input.periodEnd },
      },
      include: { managementCategory: true },
    });

    const dreInputEvents = events
      .filter((e) => e.managementCategory)
      .map((e) => ({
        eventKind: e.eventKind,
        dreLine: e.managementCategory!.dreLine,
        netAmount: Number(e.netAmount),
        isTransfer: e.isTransfer,
        isDuplicate: e.isDuplicate,
      }));

    const result = calculateDre(dreInputEvents);

    const unclassifiedCount = events.length - dreInputEvents.length;
    // Confiança combina cobertura de classificação e qualidade média das evidências.
    const classificationCoverage = events.length > 0 ? dreInputEvents.length / events.length : 0;
    const weightedRatings = events
      .filter((e) => e.managementCategory)
      .map((e) => ratingForecastInclusion(e.reliabilityRating, "BASE").probabilityWeight);
    const avgRatingWeight =
      weightedRatings.length > 0 ? weightedRatings.reduce((a, b) => a + b, 0) / weightedRatings.length : 0;
    const confidenceScore = classificationCoverage * 0.5 + avgRatingWeight * 0.5;

    const dre = await prisma.dRE.upsert({
      where: { companyId_periodStart_periodEnd: { companyId: input.companyId, periodStart: input.periodStart, periodEnd: input.periodEnd } },
      create: {
        companyId: input.companyId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        grossRevenue: result.grossRevenue,
        salesDeductions: result.salesDeductions,
        netRevenue: result.netRevenue,
        variableCosts: result.variableCosts,
        contributionMargin: result.contributionMargin,
        fixedExpenses: result.fixedExpenses,
        ebitda: result.ebitda,
        financialExpenses: result.financialExpenses,
        nonRecurring: result.nonRecurring,
        managementResult: result.managementResult,
        confidenceScore,
      },
      update: {
        grossRevenue: result.grossRevenue,
        salesDeductions: result.salesDeductions,
        netRevenue: result.netRevenue,
        variableCosts: result.variableCosts,
        contributionMargin: result.contributionMargin,
        fixedExpenses: result.fixedExpenses,
        ebitda: result.ebitda,
        financialExpenses: result.financialExpenses,
        nonRecurring: result.nonRecurring,
        managementResult: result.managementResult,
        confidenceScore,
      },
    });

    await prisma.dRELineItem.deleteMany({ where: { dreId: dre.id } });
    const lineDefs: Array<[keyof typeof result, string, "GROSS_REVENUE" | "SALES_DEDUCTIONS" | "NET_REVENUE" | "VARIABLE_COSTS" | "CONTRIBUTION_MARGIN" | "FIXED_EXPENSES" | "EBITDA" | "FINANCIAL_EXPENSES" | "NON_RECURRING" | "MANAGEMENT_RESULT"]> = [
      ["grossRevenue", "Receita bruta", "GROSS_REVENUE"],
      ["salesDeductions", "Deduções e impostos sobre vendas", "SALES_DEDUCTIONS"],
      ["netRevenue", "Receita líquida", "NET_REVENUE"],
      ["variableCosts", "Custos variáveis", "VARIABLE_COSTS"],
      ["contributionMargin", "Margem de contribuição", "CONTRIBUTION_MARGIN"],
      ["fixedExpenses", "Despesas fixas", "FIXED_EXPENSES"],
      ["ebitda", "EBITDA gerencial", "EBITDA"],
      ["financialExpenses", "Despesas financeiras", "FINANCIAL_EXPENSES"],
      ["nonRecurring", "Itens não recorrentes", "NON_RECURRING"],
      ["managementResult", "Resultado gerencial", "MANAGEMENT_RESULT"],
    ];

    await prisma.dRELineItem.createMany({
      data: lineDefs.map(([key, label, dreLine]) => ({
        dreId: dre.id,
        label,
        dreLine,
        amount: result[key] as number,
        confidence: confidenceScore,
      })),
    });

    const warnings: AgentRunResult<DreAgentOutput>["warnings"] = [];
    if (unclassifiedCount > 0) {
      warnings.push({
        code: "UNCLASSIFIED_EVENTS",
        message: `${unclassifiedCount} evento(s) do período sem categoria — não entraram no DRE.`,
      });
    }

    return {
      output: { dreId: dre.id, managementResult: result.managementResult, confidenceScore },
      confidence: confidenceScore,
      warnings,
      errors: [],
      ruleBasedMode: true,
    };
  }
}
