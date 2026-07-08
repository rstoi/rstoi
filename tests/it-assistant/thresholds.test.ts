import { describe, it, expect } from "vitest";
import { evaluate } from "../../src/it-assistant/thresholds.js";

describe("thresholds.evaluate", () => {
  it("classifica métricas boas como ok, sem verdicts", () => {
    const { status, verdicts } = evaluate({
      latencyMs: 40,
      jitterMs: 5,
      packetLossPct: 0,
      downloadMbps: 50,
      uploadMbps: 15,
      dnsMs: 20,
    });
    expect(status).toBe("ok");
    expect(verdicts).toEqual([]);
  });

  it("marca latência alta como warning", () => {
    const { status, verdicts } = evaluate({ latencyMs: 150 });
    expect(status).toBe("warning");
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].metric).toBe("latencyMs");
  });

  it("marca perda de pacotes alta como critical", () => {
    const { status } = evaluate({ packetLossPct: 10 });
    expect(status).toBe("critical");
  });

  it("download baixo (inversão: menor é pior) gera warning/critical corretamente", () => {
    expect(evaluate({ downloadMbps: 3 }).status).toBe("warning");
    expect(evaluate({ downloadMbps: 1 }).status).toBe("critical");
    expect(evaluate({ downloadMbps: 20 }).status).toBe("ok");
  });

  it("o pior indicador entre várias métricas determina o status geral", () => {
    const { status } = evaluate({ latencyMs: 40, jitterMs: 5, packetLossPct: 8 });
    expect(status).toBe("critical");
  });

  it("ignora métricas ausentes (null/undefined) sem quebrar", () => {
    const { status, verdicts } = evaluate({ latencyMs: null, jitterMs: undefined });
    expect(status).toBe("ok");
    expect(verdicts).toEqual([]);
  });
});
