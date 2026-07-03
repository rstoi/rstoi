import { describe, expect, it } from "vitest";
import { evaluateDirector } from "@/lib/director-evaluation-service";

describe("evaluateDirector", () => {
  it("calcula score por dimensão como média dos critérios", () => {
    const result = evaluateDirector([
      { dimension: "STRATEGIC_LEADERSHIP", criterion: "Clareza de prioridades", score: 4 },
      { dimension: "STRATEGIC_LEADERSHIP", criterion: "Alinhamento de decisões", score: 2 },
    ]);
    expect(result.dimensionScores.STRATEGIC_LEADERSHIP).toBe(3);
  });

  it("calcula score geral como média das oito dimensões", () => {
    const result = evaluateDirector([
      { dimension: "STRATEGIC_LEADERSHIP", criterion: "Clareza de prioridades", score: 5 },
      { dimension: "FINANCIAL_MANAGEMENT", criterion: "DRE confiável", score: 5 },
    ]);
    // 2 dimensões com score 5, 6 dimensões sem critérios avaliados (score 0)
    expect(result.totalScore).toBeCloseTo((5 + 5) / 8);
  });

  it("gera recomendação de melhoria para dimensões com nota baixa", () => {
    const result = evaluateDirector([
      { dimension: "GOVERNANCE_ROLES", criterion: "Atas", score: 1 },
    ]);
    const governance = result.recommendations.find((r) => r.dimension === "GOVERNANCE_ROLES");
    expect(governance?.recommendation).toMatch(/formalizar/i);
  });
});
