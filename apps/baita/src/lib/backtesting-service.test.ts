import { describe, expect, it } from "vitest";
import { runBacktesting } from "@/lib/backtesting-service";

describe("runBacktesting", () => {
  it("calcula erro absoluto e percentual por linha", () => {
    const summary = runBacktesting([
      { date: "2026-06-01", category: "Recebíveis", predictedAmount: 10000, actualAmount: 9000 },
    ]);
    expect(summary.lines[0].absoluteError).toBe(1000);
    expect(summary.lines[0].percentageError).toBeCloseTo(0.1);
  });

  it("identifica viés pessimista quando realizado supera previsto", () => {
    const summary = runBacktesting([
      { date: "2026-06-01", category: "Vendas", predictedAmount: 10000, actualAmount: 13000 },
    ]);
    expect(summary.bias).toBe("PESSIMISTA");
  });

  it("identifica viés otimista quando realizado fica abaixo do previsto", () => {
    const summary = runBacktesting([
      { date: "2026-06-01", category: "Vendas", predictedAmount: 10000, actualAmount: 6000 },
    ]);
    expect(summary.bias).toBe("OTIMISTA");
  });

  it("considera neutro quando o desvio total é pequeno", () => {
    const summary = runBacktesting([
      { date: "2026-06-01", category: "Vendas", predictedAmount: 10000, actualAmount: 10100 },
    ]);
    expect(summary.bias).toBe("NEUTRO");
  });

  it("calcula accuracyScore próximo de 1 quando o erro é pequeno", () => {
    const summary = runBacktesting([
      { date: "2026-06-01", category: "Vendas", predictedAmount: 10000, actualAmount: 10000 },
    ]);
    expect(summary.accuracyScore).toBe(1);
  });
});
