/**
 * DreService — cálculo do DRE gerencial a partir de eventos financeiros
 * classificados. Centraliza a lógica para que nenhuma tela recalcule os
 * números de forma divergente.
 *
 * Regra estrutural (não deve ser violada por nenhum agente ou tela):
 * - entrada de empréstimo NÃO é receita
 * - pagamento de principal de dívida NÃO é despesa operacional
 * - juros são despesa financeira
 * - transferência entre contas não é receita nem despesa
 * - investimento é separado de despesa recorrente
 * - itens não recorrentes são destacados separadamente
 */
import type { DreLine, FinancialEventKind } from "@prisma/client";

export type DreInputEvent = {
  eventKind: FinancialEventKind;
  dreLine: DreLine;
  netAmount: number;
  recurrenceType?: string | null;
  isTransfer?: boolean;
  isDuplicate?: boolean;
};

export type DreResult = {
  grossRevenue: number;
  salesDeductions: number;
  netRevenue: number;
  variableCosts: number;
  contributionMargin: number;
  fixedExpenses: number;
  ebitda: number;
  financialExpenses: number;
  nonRecurring: number;
  managementResult: number;
  contributionMarginPercent: number;
};

/** Eventos que nunca entram no DRE gerencial, independentemente da categoria. */
function isExcludedFromDre(event: DreInputEvent): boolean {
  if (event.isTransfer) return true;
  if (event.isDuplicate) return true;
  if (event.eventKind === "TRANSFER") return true;
  if (event.eventKind === "DEBT_PRINCIPAL") return true; // amortização não é despesa operacional
  if (event.eventKind === "INVESTMENT") return true; // investimento não é despesa recorrente
  return false;
}

export function calculateDre(events: DreInputEvent[]): DreResult {
  const sums: Record<DreLine, number> = {
    GROSS_REVENUE: 0,
    SALES_DEDUCTIONS: 0,
    NET_REVENUE: 0,
    VARIABLE_COSTS: 0,
    CONTRIBUTION_MARGIN: 0,
    FIXED_EXPENSES: 0,
    EBITDA: 0,
    FINANCIAL_EXPENSES: 0,
    NON_RECURRING: 0,
    MANAGEMENT_RESULT: 0,
    NOT_APPLICABLE: 0,
  };

  for (const event of events) {
    if (isExcludedFromDre(event)) continue;
    sums[event.dreLine] += event.netAmount;
  }

  const grossRevenue = sums.GROSS_REVENUE;
  const salesDeductions = Math.abs(sums.SALES_DEDUCTIONS);
  const netRevenue = grossRevenue - salesDeductions;
  const variableCosts = Math.abs(sums.VARIABLE_COSTS);
  const contributionMargin = netRevenue - variableCosts;
  const fixedExpenses = Math.abs(sums.FIXED_EXPENSES);
  const ebitda = contributionMargin - fixedExpenses;
  // Despesas financeiras: juros (DEBT_INTEREST) entram aqui, nunca o principal.
  const financialExpenses = Math.abs(sums.FINANCIAL_EXPENSES);
  const nonRecurring = sums.NON_RECURRING;
  const managementResult = ebitda - financialExpenses + nonRecurring;
  const contributionMarginPercent = netRevenue !== 0 ? contributionMargin / netRevenue : 0;

  return {
    grossRevenue,
    salesDeductions,
    netRevenue,
    variableCosts,
    contributionMargin,
    fixedExpenses,
    ebitda,
    financialExpenses,
    nonRecurring,
    managementResult,
    contributionMarginPercent,
  };
}

export function breakEvenPoint(fixedExpenses: number, contributionMarginPercent: number): number | null {
  if (contributionMarginPercent <= 0) return null;
  return fixedExpenses / contributionMarginPercent;
}

export function debtCoverageRatio(ebitda: number, monthlyDebtService: number): number | null {
  if (monthlyDebtService <= 0) return null;
  return ebitda / monthlyDebtService;
}
