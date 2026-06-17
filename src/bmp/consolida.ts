/**
 * Consolidação do extrato BMP (Conta consignada) — Workflow B, passo 3 do
 * blueprint: total de entradas, total de saídas, saldo e agrupamento por
 * contraparte. Função pura (sem IO) e testável.
 *
 * Regra de tier do blueprint: cálculos financeiros são SEMPRE feitos em código,
 * nunca "de cabeça".
 */

import type { Movimentacao } from "./types.js";

export interface GrupoContraparte {
  contraparte: string;
  entradas: number;
  saidas: number;
  saldo: number;
  movimentacoes: number;
}

export interface ExtratoConsolidado {
  conta: string;
  periodo: { inicio?: string; fim?: string };
  totalMovimentacoes: number;
  totalEntradas: number;
  totalSaidas: number;
  /** entradas − saídas (saldo de passagem da conta escrow ≈ 0). */
  saldoLiquido: number;
  /** Último saldo informado pelo extrato, se houver. */
  saldoFinal?: number;
  porContraparte: GrupoContraparte[];
}

/** Extrai a contraparte da descrição (heurística: remove ruído comum). */
export function extrairContraparte(descricao: string): string {
  const d = (descricao ?? "").trim();
  if (!d) return "(sem descrição)";
  return d
    .replace(/\b(pix|ted|doc|tarifa|pagamento|recebido|enviado|transfer[êe]ncia|cr[eé]dito|d[eé]bito)\b/gi, "")
    .replace(/\b(de|para|ref\.?|n[º°o]\.?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || d;
}

/** Arredonda para 2 casas evitando erro de ponto flutuante. */
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function consolidarExtrato(
  movs: Movimentacao[],
  periodo: { inicio?: string; fim?: string } = {},
): ExtratoConsolidado {
  const conta = movs[0]?.conta ?? "";
  let totalEntradas = 0;
  let totalSaidas = 0;
  const grupos = new Map<string, GrupoContraparte>();

  for (const m of movs) {
    const entrada = m.tipo === "credito" ? m.valor : 0;
    const saida = m.tipo === "debito" ? m.valor : 0;
    totalEntradas += entrada;
    totalSaidas += saida;

    const chave = extrairContraparte(m.descricao);
    const g = grupos.get(chave) ?? { contraparte: chave, entradas: 0, saidas: 0, saldo: 0, movimentacoes: 0 };
    g.entradas += entrada;
    g.saidas += saida;
    g.movimentacoes += 1;
    grupos.set(chave, g);
  }

  const porContraparte = [...grupos.values()]
    .map((g) => ({ ...g, entradas: r2(g.entradas), saidas: r2(g.saidas), saldo: r2(g.entradas - g.saidas) }))
    .sort((a, b) => b.entradas + b.saidas - (a.entradas + a.saidas));

  // Saldo final = saldo da última movimentação com saldo informado.
  const comSaldo = movs.filter((m) => typeof m.saldo === "number");
  const saldoFinal = comSaldo.length ? comSaldo[comSaldo.length - 1].saldo : undefined;

  return {
    conta,
    periodo,
    totalMovimentacoes: movs.length,
    totalEntradas: r2(totalEntradas),
    totalSaidas: r2(totalSaidas),
    saldoLiquido: r2(totalEntradas - totalSaidas),
    saldoFinal,
    porContraparte,
  };
}
