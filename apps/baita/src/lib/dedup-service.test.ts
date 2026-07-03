import { describe, expect, it } from "vitest";
import { detectDuplicates } from "@/lib/dedup-service";

describe("detectDuplicates", () => {
  it("detecta duplicata por mesmo documento de referência", () => {
    const matches = detectDuplicates([
      { id: "1", amount: 500, date: "2026-06-01", documentRef: "NF-123" },
      { id: "2", amount: 500, date: "2026-06-05", documentRef: "NF-123" },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ id: "2", duplicateOfId: "1" });
  });

  it("detecta duplicata por valor + contraparte + datas próximas", () => {
    const matches = detectDuplicates([
      { id: "1", amount: 1200, date: "2026-06-01", counterparty: "Fornecedor X" },
      { id: "2", amount: 1200, date: "2026-06-02", counterparty: "fornecedor x" },
    ]);
    expect(matches).toHaveLength(1);
  });

  it("não marca como duplicata quando contraparte difere", () => {
    const matches = detectDuplicates([
      { id: "1", amount: 1200, date: "2026-06-01", counterparty: "Fornecedor X" },
      { id: "2", amount: 1200, date: "2026-06-01", counterparty: "Fornecedor Y" },
    ]);
    expect(matches).toHaveLength(0);
  });

  it("não marca como duplicata quando datas estão distantes", () => {
    const matches = detectDuplicates([
      { id: "1", amount: 1200, date: "2026-06-01", counterparty: "Fornecedor X" },
      { id: "2", amount: 1200, date: "2026-06-20", counterparty: "Fornecedor X" },
    ]);
    expect(matches).toHaveLength(0);
  });
});
