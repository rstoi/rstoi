/**
 * TreasuryAgent — calcula caixa livre, caixa comprometido, obrigações
 * críticas, recebíveis e risco de liquidez a partir das contas a pagar,
 * receber, dívidas e impostos cadastrados.
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { calculateTreasury, type TreasuryResult } from "@/lib/treasury-service";
import { prisma } from "@/lib/prisma";

export type TreasuryAgentInput = { companyId: string; referenceDate?: Date };
export type TreasuryAgentOutput = TreasuryResult & {
  currentCash: number;
  receivablesOverdue: number;
  receivablesUpcoming: number;
  payablesOverdue: number;
  payablesUpcoming: number;
  totalDebt: number;
  monthlyDebtService: number;
  taxesOverdue: number;
  taxesUpcoming: number;
};

export class TreasuryAgent extends BaseAgent<TreasuryAgentInput, TreasuryAgentOutput> {
  readonly name = "TreasuryAgent";
  readonly version = "1.0.0";
  readonly description = "Calcula a situação financeira atual da empresa.";

  protected async execute(input: TreasuryAgentInput): Promise<AgentRunResult<TreasuryAgentOutput>> {
    const referenceDate = input.referenceDate ?? new Date();

    const [receivables, payables, debts, taxes, cashEvents, lastDre] = await Promise.all([
      prisma.receivable.findMany({ where: { companyId: input.companyId } }),
      prisma.payable.findMany({ where: { companyId: input.companyId } }),
      prisma.debt.findMany({ where: { companyId: input.companyId } }),
      prisma.taxObligation.findMany({ where: { companyId: input.companyId } }),
      prisma.financialEvent.findMany({
        where: { companyId: input.companyId, eventKind: { in: ["CASH_IN", "CASH_OUT"] }, isDuplicate: false },
      }),
      prisma.dRE.findFirst({ where: { companyId: input.companyId }, orderBy: { periodEnd: "desc" } }),
    ]);

    const currentCash = cashEvents.reduce((sum, e) => {
      const amount = Number(e.netAmount);
      return sum + (e.eventKind === "CASH_IN" ? amount : -Math.abs(amount));
    }, 0);

    const receivablesOverdue = receivables
      .filter((r) => r.status === "OVERDUE" || (r.dueDate < referenceDate && r.status === "OPEN"))
      .reduce((sum, r) => sum + Number(r.amount) * r.probability, 0);
    const receivablesUpcoming = receivables
      .filter((r) => r.status === "OPEN" && r.dueDate >= referenceDate)
      .reduce((sum, r) => sum + Number(r.amount) * r.probability, 0);

    const payablesOverdue = payables
      .filter((p) => p.status === "OVERDUE" || (p.dueDate < referenceDate && p.status === "OPEN"))
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const payablesUpcoming = payables
      .filter((p) => p.status === "OPEN" && p.dueDate >= referenceDate)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const totalDebt = debts.reduce((sum, d) => sum + Number(d.principalBalance), 0);
    const monthlyDebtService = debts.reduce((sum, d) => sum + Number(d.installmentAmount ?? 0), 0);

    const taxesOverdue = taxes
      .filter((t) => t.status === "OVERDUE" || (t.dueDate < referenceDate && t.status === "OPEN"))
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const taxesUpcoming = taxes
      .filter((t) => t.status === "OPEN" && t.dueDate >= referenceDate)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const committedCash = payablesOverdue + taxesOverdue;
    const netRevenueMonthly = lastDre ? Number(lastDre.netRevenue) : 0;
    const managementResultMonthly = lastDre ? Number(lastDre.managementResult) : 0;
    const monthlyBurn = payablesUpcoming + monthlyDebtService + taxesUpcoming;

    const treasuryInput = {
      currentCash,
      committedCash,
      receivablesOverdue,
      receivablesUpcoming,
      payablesOverdue,
      payablesUpcoming,
      totalDebt,
      monthlyDebtService,
      taxesOverdue,
      taxesUpcoming,
      monthlyBurn,
      netRevenueMonthly,
      managementResultMonthly,
    };

    const result = calculateTreasury(treasuryInput);

    const warnings: AgentRunResult<TreasuryAgentOutput>["warnings"] = [];
    if (result.liquidityRisk === "CRITICAL" || result.liquidityRisk === "HIGH") {
      warnings.push({
        code: "LIQUIDITY_RISK",
        message: `Risco de liquidez ${result.liquidityRisk}: caixa livre de ${result.freeCash.toFixed(2)}.`,
      });
    }

    const confidence = lastDre ? Number(lastDre.confidenceScore) : 0.4;

    return {
      output: { ...result, ...treasuryInput },
      confidence,
      warnings,
      errors: [],
      ruleBasedMode: true,
    };
  }
}
