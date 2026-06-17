import { describe, it, expect } from "vitest";
import {
  parseNumeroBR,
  parseValorBR,
  parseDataBR,
  detectarTipo,
  makeMovimentacaoId,
  linhaToMovimentacao,
} from "../../src/bmp/parse.js";

describe("parse BMP", () => {
  it("parseValorBR — padrão brasileiro (milhar . / decimal ,)", () => {
    expect(parseValorBR("1.234,56")).toBe(1234.56);
    expect(parseValorBR("R$ 1.234,56")).toBe(1234.56);
    expect(parseValorBR("-50,00")).toBe(50); // valor sempre absoluto
    expect(parseValorBR("0,00")).toBe(0);
    expect(parseValorBR("")).toBe(0);
  });

  it("parseNumeroBR — preserva sinal para saldo", () => {
    expect(parseNumeroBR("-1.000,00", { sinal: true })).toBe(-1000);
    expect(parseNumeroBR("(1.000,00)", { sinal: true })).toBe(-1000);
    expect(parseNumeroBR("1.000,00", { sinal: true })).toBe(1000);
  });

  it("parseDataBR — dd/mm/aaaa → ISO", () => {
    expect(parseDataBR("17/06/2026")).toBe("2026-06-17");
    expect(parseDataBR("01/02/26")).toBe("2026-02-01");
    expect(parseDataBR("2026-06-17")).toBe("2026-06-17");
  });

  it("detectarTipo — por coluna e por sinal", () => {
    expect(detectarTipo({ data: "", descricao: "", valor: "100,00", tipo: "C" })).toBe("credito");
    expect(detectarTipo({ data: "", descricao: "", valor: "100,00", tipo: "Débito" })).toBe("debito");
    expect(detectarTipo({ data: "", descricao: "", valor: "-100,00" })).toBe("debito");
    expect(detectarTipo({ data: "", descricao: "", valor: "100,00 D" })).toBe("debito");
    expect(detectarTipo({ data: "", descricao: "", valor: "100,00" })).toBe("credito");
  });

  it("makeMovimentacaoId — estável e sensível às colunas", () => {
    const base = { conta: "BMP", data: "2026-06-17", descricao: "PIX recebido", valor: 100, documento: "X1" };
    const id1 = makeMovimentacaoId(base);
    const id2 = makeMovimentacaoId({ ...base, descricao: "  pix RECEBIDO " }); // normalizado
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^bmp-[0-9a-f]{24}$/);
    expect(makeMovimentacaoId({ ...base, valor: 101 })).not.toBe(id1);
  });

  it("linhaToMovimentacao — normaliza linha completa", () => {
    const mov = linhaToMovimentacao(
      { data: "17/06/2026", descricao: "Transferência", documento: "123", valor: "-1.500,00", saldo: "2.000,00" },
      "BMP conta corrente",
      1_700_000_000_000,
    );
    expect(mov.data).toBe("2026-06-17");
    expect(mov.tipo).toBe("debito");
    expect(mov.valor).toBe(1500);
    expect(mov.saldo).toBe(2000);
    expect(mov.documento).toBe("123");
    expect(mov.capturadoEm).toBe(1_700_000_000_000);
  });
});
