import { describe, it, expect } from "vitest";
import { consolidarExtrato, extrairContraparte } from "../../src/bmp/consolida.js";
import { linhaToMovimentacao } from "../../src/bmp/parse.js";
import type { LinhaExtrato } from "../../src/bmp/types.js";

const linhas: LinhaExtrato[] = [
  { data: "17/06/2026", descricao: "PIX recebido Cliente A", valor: "2.500,00", saldo: "12.500,00" },
  { data: "17/06/2026", descricao: "Antecipacao recebivel NF 9981", valor: "8.000,00 C", saldo: "20.500,00" },
  { data: "17/06/2026", descricao: "Tarifa TED", valor: "-9,90", saldo: "20.490,10" },
  { data: "17/06/2026", descricao: "Pagamento fornecedor XPTO", valor: "-1.250,00", saldo: "19.240,10" },
];

describe("consolidarExtrato", () => {
  const movs = linhas.map((l) => linhaToMovimentacao(l, "BMP", 1));

  it("soma entradas, saídas e saldo líquido (cálculo em código, não 'de cabeça')", () => {
    const c = consolidarExtrato(movs, { inicio: "2026-06-01", fim: "2026-06-17" });
    expect(c.totalMovimentacoes).toBe(4);
    expect(c.totalEntradas).toBe(10500);
    expect(c.totalSaidas).toBe(1259.9);
    expect(c.saldoLiquido).toBe(9240.1);
    expect(c.saldoFinal).toBe(19240.1);
    expect(c.periodo).toEqual({ inicio: "2026-06-01", fim: "2026-06-17" });
  });

  it("agrupa por contraparte", () => {
    const c = consolidarExtrato(movs);
    expect(c.porContraparte.length).toBeGreaterThanOrEqual(3);
    const soma = c.porContraparte.reduce((s, g) => s + g.entradas, 0);
    expect(Math.round(soma * 100) / 100).toBe(10500);
  });

  it("não acumula erro de ponto flutuante", () => {
    const ms = [
      linhaToMovimentacao({ data: "01/01/2026", descricao: "a", valor: "0,10" }, "BMP", 1),
      linhaToMovimentacao({ data: "01/01/2026", descricao: "b", valor: "0,20" }, "BMP", 1),
    ];
    expect(consolidarExtrato(ms).totalEntradas).toBe(0.3);
  });
});

describe("extrairContraparte", () => {
  it("remove ruído comum (PIX/TED/de/para)", () => {
    expect(extrairContraparte("PIX recebido de Cliente A")).toContain("Cliente A");
    expect(extrairContraparte("")).toBe("(sem descrição)");
  });
});
