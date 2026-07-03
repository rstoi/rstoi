import { describe, expect, it } from "vitest";
import {
  calculateReliabilityRating,
  checkRatingForDecision,
  ratingForecastInclusion,
} from "@/lib/rating-service";

describe("calculateReliabilityRating", () => {
  it("retorna A quando extrato bate com documento", () => {
    const result = calculateReliabilityRating({ bankStatementMatchesDocument: true });
    expect(result.rating).toBe("A");
  });

  it("retorna A com duas fontes fortes", () => {
    const result = calculateReliabilityRating({ strongSourceCount: 2 });
    expect(result.rating).toBe("A");
  });

  it("retorna B com nota fiscal emitida sem recebimento", () => {
    const result = calculateReliabilityRating({ invoiceIssuedWithoutReceipt: true });
    expect(result.rating).toBe("B");
  });

  it("retorna C com ERP sem conciliação", () => {
    const result = calculateReliabilityRating({ erpWithoutReconciliation: true });
    expect(result.rating).toBe("C");
  });

  it("retorna D para canal informal", () => {
    const result = calculateReliabilityRating({ informalChannel: true });
    expect(result.rating).toBe("D");
  });

  it("retorna E para dados contraditórios mesmo com fontes fortes", () => {
    const result = calculateReliabilityRating({
      strongSourceCount: 2,
      contradictoryAcrossSources: true,
    });
    expect(result.rating).toBe("E");
  });

  it("retorna UNKNOWN sem nenhuma evidência", () => {
    const result = calculateReliabilityRating({});
    expect(result.rating).toBe("UNKNOWN");
  });
});

describe("checkRatingForDecision", () => {
  it("bloqueia pagamento crítico com rating C", () => {
    const result = checkRatingForDecision("C", "CRITICAL_PAYMENT");
    expect(result.allowed).toBe(false);
  });

  it("permite pagamento crítico com rating A", () => {
    const result = checkRatingForDecision("A", "CRITICAL_PAYMENT");
    expect(result.allowed).toBe(true);
  });

  it("exige revisão humana em corte estrutural mesmo com rating B", () => {
    const result = checkRatingForDecision("B", "STRUCTURAL_CUT");
    expect(result.allowed).toBe(true);
    expect(result.requiresHumanReview).toBe(true);
  });

  it("permite hipótese comercial com rating D", () => {
    const result = checkRatingForDecision("D", "COMMERCIAL_HYPOTHESIS");
    expect(result.allowed).toBe(true);
  });
});

describe("ratingForecastInclusion", () => {
  it("exclui rating D do cenário conservador", () => {
    expect(ratingForecastInclusion("D", "CONSERVATIVE").included).toBe(false);
  });

  it("inclui rating C no cenário base com desconto de 0.5", () => {
    const result = ratingForecastInclusion("C", "BASE");
    expect(result.included).toBe(true);
    expect(result.probabilityWeight).toBe(0.5);
  });

  it("inclui rating D no cenário otimista com peso reduzido", () => {
    const result = ratingForecastInclusion("D", "OPTIMISTIC");
    expect(result.included).toBe(true);
    expect(result.probabilityWeight).toBe(0.3);
  });

  it("inclui rating A integralmente em todos os cenários", () => {
    for (const scenario of ["CONSERVATIVE", "BASE", "OPTIMISTIC"] as const) {
      expect(ratingForecastInclusion("A", scenario)).toEqual({
        included: true,
        probabilityWeight: 1,
      });
    }
  });
});
