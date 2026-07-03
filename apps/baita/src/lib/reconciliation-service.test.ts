import { describe, expect, it } from "vitest";
import { matchReconciliation } from "@/lib/reconciliation-service";

describe("matchReconciliation", () => {
  it("concilia eventos com mesma contraparte, valor e data", () => {
    const matches = matchReconciliation(
      [{ id: "bank-1", amount: 1000, date: "2026-06-01", counterparty: "Cliente A" }],
      [{ id: "nf-1", amount: 1000, date: "2026-06-02", counterparty: "Cliente A" }]
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].status).toBe("MATCHED");
  });

  it("marca como divergente quando valores não batem", () => {
    const matches = matchReconciliation(
      [{ id: "bank-1", amount: 1000, date: "2026-06-01", counterparty: "Cliente A" }],
      [{ id: "nf-1", amount: 950, date: "2026-06-01", counterparty: "Cliente A" }]
    );
    expect(matches[0].status).toBe("DIVERGENT");
    expect(matches[0].divergenceAmount).toBe(50);
  });

  it("não concilia quando datas estão fora da tolerância", () => {
    const matches = matchReconciliation(
      [{ id: "bank-1", amount: 1000, date: "2026-06-01", counterparty: "Cliente A" }],
      [{ id: "nf-1", amount: 1000, date: "2026-06-20", counterparty: "Cliente A" }]
    );
    expect(matches).toHaveLength(0);
  });
});
