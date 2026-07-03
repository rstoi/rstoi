/**
 * TreasuryService — situação financeira atual: caixa livre/comprometido,
 * capital de giro, runway e classificação da situação da empresa.
 */

export type TreasuryInput = {
  currentCash: number;
  committedCash: number; // obrigações já garantidas/reservadas sobre o caixa atual
  receivablesOverdue: number;
  receivablesUpcoming: number;
  payablesOverdue: number;
  payablesUpcoming: number;
  totalDebt: number;
  monthlyDebtService: number;
  taxesOverdue: number;
  taxesUpcoming: number;
  monthlyBurn: number;
  netRevenueMonthly: number;
  managementResultMonthly: number;
  inventory?: number;
  /** Necessidade de capital de giro em relação à receita líquida (opcional, para detectar crescimento desordenado). */
  workingCapitalNeedRatio?: number;
};

export type TreasurySituation =
  | "PROFITABLE_WITH_CASH"
  | "PROFITABLE_WITHOUT_CASH"
  | "LOSS_WITH_CASH"
  | "LOSS_WITHOUT_CASH"
  | "NEGATIVE_MARGIN"
  | "EXCESSIVE_DEBT"
  | "DISORDERLY_GROWTH";

export type LiquidityRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type TreasuryResult = {
  freeCash: number;
  committedCash: number;
  workingCapitalNeed: number;
  runwayMonths: number | null;
  liquidityRisk: LiquidityRisk;
  situation: TreasurySituation;
};

export function calculateWorkingCapitalNeed(input: {
  receivables: number;
  payables: number;
  inventory?: number;
}): number {
  return input.receivables + (input.inventory ?? 0) - input.payables;
}

export function calculateRunwayMonths(availableCash: number, monthlyBurn: number): number | null {
  if (monthlyBurn <= 0) return null;
  return availableCash / monthlyBurn;
}

export function assessLiquidityRisk(input: TreasuryInput): LiquidityRisk {
  const freeCash = input.currentCash - input.committedCash;
  const criticalObligations = input.payablesOverdue + input.taxesOverdue;

  if (freeCash < 0 || criticalObligations > input.currentCash) return "CRITICAL";

  const runway = calculateRunwayMonths(freeCash, input.monthlyBurn);
  if (runway !== null && runway < 1) return "CRITICAL";
  if (runway !== null && runway < 2) return "HIGH";
  if (input.payablesOverdue > 0 || input.taxesOverdue > 0) return "MEDIUM";
  if (runway !== null && runway < 4) return "MEDIUM";
  return "LOW";
}

export function classifyTreasurySituation(input: TreasuryInput): TreasurySituation {
  const isProfitable = input.managementResultMonthly >= 0;
  const hasFreeCash = input.currentCash - input.committedCash > 0;
  const marginPercent =
    input.netRevenueMonthly !== 0 ? input.managementResultMonthly / input.netRevenueMonthly : 0;
  const debtCoverage =
    input.monthlyDebtService > 0 ? input.managementResultMonthly / input.monthlyDebtService : Infinity;

  if (marginPercent < 0 && input.managementResultMonthly < 0 && marginPercent <= -0.1) {
    return "NEGATIVE_MARGIN";
  }
  if (input.totalDebt > 0 && debtCoverage < 1) {
    return "EXCESSIVE_DEBT";
  }
  if (isProfitable && input.netRevenueMonthly > 0 && !hasFreeCash) {
    // cresce em receita, mas consome caixa mais rápido do que gera resultado
    const growthMismatch = input.workingCapitalNeedRatio ?? 0;
    if (growthMismatch > 0.3) return "DISORDERLY_GROWTH";
  }

  if (isProfitable && hasFreeCash) return "PROFITABLE_WITH_CASH";
  if (isProfitable && !hasFreeCash) return "PROFITABLE_WITHOUT_CASH";
  if (!isProfitable && hasFreeCash) return "LOSS_WITH_CASH";
  return "LOSS_WITHOUT_CASH";
}

export function calculateTreasury(input: TreasuryInput): TreasuryResult {
  const freeCash = input.currentCash - input.committedCash;
  const workingCapitalNeed = calculateWorkingCapitalNeed({
    receivables: input.receivablesOverdue + input.receivablesUpcoming,
    payables: input.payablesOverdue + input.payablesUpcoming,
    inventory: input.inventory,
  });
  const runwayMonths = calculateRunwayMonths(Math.max(freeCash, 0), input.monthlyBurn);
  const liquidityRisk = assessLiquidityRisk(input);
  const situation = classifyTreasurySituation(input);

  return {
    freeCash,
    committedCash: input.committedCash,
    workingCapitalNeed,
    runwayMonths,
    liquidityRisk,
    situation,
  };
}

export const TREASURY_SITUATION_LABELS: Record<TreasurySituation, string> = {
  PROFITABLE_WITH_CASH: "Lucrativa e com caixa",
  PROFITABLE_WITHOUT_CASH: "Lucrativa e sem caixa",
  LOSS_WITH_CASH: "Prejuízo e com caixa",
  LOSS_WITHOUT_CASH: "Prejuízo e sem caixa",
  NEGATIVE_MARGIN: "Margem negativa",
  EXCESSIVE_DEBT: "Dívida excessiva",
  DISORDERLY_GROWTH: "Crescimento desordenado",
};

export const LIQUIDITY_RISK_LABELS: Record<LiquidityRisk, string> = {
  LOW: "Baixo",
  MEDIUM: "Médio",
  HIGH: "Alto",
  CRITICAL: "Crítico",
};
