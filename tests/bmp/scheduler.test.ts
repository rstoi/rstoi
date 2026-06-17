import { describe, it, expect } from "vitest";
import { msUntilNextRun } from "../../src/bmp/scheduler.js";

const TZ = "America/Sao_Paulo"; // UTC-3, sem horário de verão desde 2019

describe("msUntilNextRun", () => {
  it("calcula horas até a próxima 01:00 em São Paulo", () => {
    // 2026-06-17T00:00:00Z = 2026-06-16 21:00 em SP → próxima 01:00 SP é em 4h.
    const now = new Date("2026-06-17T00:00:00.000Z");
    expect(msUntilNextRun(now, 1, 0, TZ)).toBe(4 * 3_600_000);
  });

  it("quando o horário já passou hoje, agenda para amanhã", () => {
    // 2026-06-17T12:00:00Z = 09:00 em SP → próxima 01:00 SP é em 16h.
    const now = new Date("2026-06-17T12:00:00.000Z");
    expect(msUntilNextRun(now, 1, 0, TZ)).toBe(16 * 3_600_000);
  });

  it("desconta os milissegundos do instante atual", () => {
    const now = new Date("2026-06-17T00:00:00.500Z");
    expect(msUntilNextRun(now, 1, 0, TZ)).toBe(4 * 3_600_000 - 500);
  });

  it("retorna ~24h quando já é exatamente o horário-alvo", () => {
    // 04:00Z = 01:00 SP exatamente → próxima ocorrência em 24h.
    const now = new Date("2026-06-17T04:00:00.000Z");
    expect(msUntilNextRun(now, 1, 0, TZ)).toBe(24 * 3_600_000);
  });
});
