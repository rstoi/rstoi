import { describe, expect, it } from "vitest";
import { breakEvenPoint, calculateDre, debtCoverageRatio } from "@/lib/dre-service";

describe("calculateDre", () => {
  it("calcula DRE completo separando dívida e investimento", () => {
    const result = calculateDre([
      { eventKind: "REVENUE", dreLine: "GROSS_REVENUE", netAmount: 100000 },
      { eventKind: "TAX", dreLine: "SALES_DEDUCTIONS", netAmount: -8000 },
      { eventKind: "COST", dreLine: "VARIABLE_COSTS", netAmount: -30000 },
      { eventKind: "EXPENSE", dreLine: "FIXED_EXPENSES", netAmount: -20000 },
      { eventKind: "DEBT_INTEREST", dreLine: "FINANCIAL_EXPENSES", netAmount: -2000 },
      // Não devem entrar no DRE:
      { eventKind: "DEBT_PRINCIPAL", dreLine: "NOT_APPLICABLE", netAmount: -15000 },
      { eventKind: "INVESTMENT", dreLine: "NOT_APPLICABLE", netAmount: -10000 },
      { eventKind: "TRANSFER", dreLine: "NOT_APPLICABLE", netAmount: -5000, isTransfer: true },
    ]);

    expect(result.grossRevenue).toBe(100000);
    expect(result.salesDeductions).toBe(8000);
    expect(result.netRevenue).toBe(92000);
    expect(result.variableCosts).toBe(30000);
    expect(result.contributionMargin).toBe(62000);
    expect(result.fixedExpenses).toBe(20000);
    expect(result.ebitda).toBe(42000);
    expect(result.financialExpenses).toBe(2000);
    expect(result.managementResult).toBe(40000);
  });

  it("ignora eventos duplicados", () => {
    const result = calculateDre([
      { eventKind: "REVENUE", dreLine: "GROSS_REVENUE", netAmount: 100000 },
      { eventKind: "REVENUE", dreLine: "GROSS_REVENUE", netAmount: 100000, isDuplicate: true },
    ]);
    expect(result.grossRevenue).toBe(100000);
  });

  it("destaca itens não recorrentes separadamente no resultado gerencial", () => {
    const result = calculateDre([
      { eventKind: "REVENUE", dreLine: "GROSS_REVENUE", netAmount: 50000 },
      { eventKind: "ADJUSTMENT", dreLine: "NON_RECURRING", netAmount: -12000 },
    ]);
    expect(result.nonRecurring).toBe(-12000);
    expect(result.managementResult).toBe(50000 - 12000);
  });
});

describe("breakEvenPoint", () => {
  it("calcula ponto de equilíbrio a partir da margem de contribuição percentual", () => {
    expect(breakEvenPoint(20000, 0.4)).toBe(50000);
  });

  it("retorna null quando margem de contribuição não é positiva", () => {
    expect(breakEvenPoint(20000, 0)).toBeNull();
  });
});

describe("debtCoverageRatio", () => {
  it("calcula cobertura de dívida (EBITDA / serviço da dívida)", () => {
    expect(debtCoverageRatio(40000, 10000)).toBe(4);
  });

  it("retorna null sem serviço de dívida", () => {
    expect(debtCoverageRatio(40000, 0)).toBeNull();
  });
});
