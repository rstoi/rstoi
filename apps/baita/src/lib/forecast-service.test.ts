import { describe, expect, it } from "vitest";
import { aggregateMonthly, buildDailyForecast, findLowestBalance } from "@/lib/forecast-service";

describe("buildDailyForecast", () => {
  it("aplica saldo inicial + entradas - saídas por dia", () => {
    const lines = buildDailyForecast({
      startingBalance: 10000,
      dates: ["2026-07-01", "2026-07-02"],
      inflows: [{ date: "2026-07-01", amount: 5000, rating: "A" }],
      outflows: [
        { date: "2026-07-01", amount: 2000, rating: "A", outflowKind: "MANDATORY" },
        { date: "2026-07-02", amount: 1000, rating: "A", outflowKind: "MANDATORY" },
      ],
      scenario: "BASE",
    });

    expect(lines[0].closingBalance).toBe(10000 + 5000 - 2000);
    expect(lines[1].openingBalance).toBe(lines[0].closingBalance);
    expect(lines[1].closingBalance).toBe(lines[0].closingBalance - 1000);
  });

  it("exclui entradas rating D no cenário conservador", () => {
    const lines = buildDailyForecast({
      startingBalance: 1000,
      dates: ["2026-07-01"],
      inflows: [{ date: "2026-07-01", amount: 9000, rating: "D" }],
      outflows: [],
      scenario: "CONSERVATIVE",
    });
    expect(lines[0].closingBalance).toBe(1000);
  });

  it("mantém saídas obrigatórias mesmo com rating baixo", () => {
    const lines = buildDailyForecast({
      startingBalance: 5000,
      dates: ["2026-07-01"],
      inflows: [],
      outflows: [{ date: "2026-07-01", amount: 1000, rating: "D", outflowKind: "MANDATORY" }],
      scenario: "CONSERVATIVE",
    });
    expect(lines[0].closingBalance).toBe(4000);
  });
});

describe("findLowestBalance", () => {
  it("encontra a data de menor saldo projetado", () => {
    const lines = buildDailyForecast({
      startingBalance: 1000,
      dates: ["2026-07-01", "2026-07-02", "2026-07-03"],
      inflows: [{ date: "2026-07-03", amount: 5000, rating: "A" }],
      outflows: [{ date: "2026-07-02", amount: 3000, rating: "A", outflowKind: "MANDATORY" }],
      scenario: "BASE",
    });
    const lowest = findLowestBalance(lines);
    expect(lowest?.date).toBe("2026-07-02");
    expect(lowest?.balance).toBe(1000 - 3000);
  });
});

describe("aggregateMonthly", () => {
  it("agrupa linhas diárias em totais mensais", () => {
    const lines = buildDailyForecast({
      startingBalance: 0,
      dates: ["2026-07-30", "2026-07-31", "2026-08-01"],
      inflows: [{ date: "2026-08-01", amount: 1000, rating: "A" }],
      outflows: [],
      scenario: "BASE",
    });
    const monthly = aggregateMonthly(lines);
    expect(monthly.map((m) => m.month)).toEqual(["2026-07", "2026-08"]);
    expect(monthly[1].closingBalance).toBe(1000);
  });
});
