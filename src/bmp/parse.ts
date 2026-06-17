/**
 * Funções puras de normalização do extrato BMP.
 *
 * Sem dependências de browser/IO — facilmente testáveis. Convertem o texto
 * cru do extrato (datas dd/mm/aaaa, valores no padrão brasileiro) em uma
 * `Movimentacao` estável e deduplicável.
 */

import { createHash } from "crypto";
import type { LinhaExtrato, Movimentacao, TipoMovimentacao } from "./types.js";

/**
 * Converte um número no padrão brasileiro (milhar `.`, decimal `,`) para
 * `number`. Por padrão retorna o valor absoluto; com `{ sinal: true }`
 * preserva o sinal (útil para saldo, que pode ser negativo).
 */
export function parseNumeroBR(raw: string, opts: { sinal?: boolean } = {}): number {
  const s = (raw ?? "").trim();
  const negativo = s.includes("-") || /^\(.*\)$/.test(s.replace(/r\$|\s/gi, ""));
  const limpo = s.replace(/[^0-9,.]/g, "").replace(/\./g, "").replace(",", ".");
  const valor = Math.abs(Number(limpo) || 0);
  return opts.sinal && negativo ? -valor : valor;
}

/** Valor da movimentação — sempre absoluto (o sinal vai em `tipo`). */
export function parseValorBR(raw: string): number {
  return parseNumeroBR(raw);
}

/**
 * Determina crédito vs. débito. Prioriza a coluna `tipo` da tela; caso
 * ausente, infere pelo sinal/indicador no campo de valor (ex.: "-", "(...)",
 * sufixo "D").
 */
export function detectarTipo(linha: LinhaExtrato): TipoMovimentacao {
  const hint = `${linha.tipo ?? ""}`.trim().toLowerCase();
  if (/^(c|cr|cr[eé]dito|entrada)/.test(hint)) return "credito";
  if (/^(d|deb|d[eé]bito|saida|saída)/.test(hint)) return "debito";

  const v = `${linha.valor ?? ""}`.trim();
  if (v.includes("-") || /^\(.*\)$/.test(v.replace(/r\$|\s/gi, "")) || /\bd\b/i.test(v)) {
    return "debito";
  }
  return "credito";
}

/** Converte data `dd/mm/aaaa` (ou `dd/mm/aa`) em ISO `YYYY-MM-DD`. */
export function parseDataBR(raw: string): string {
  const s = (raw ?? "").trim();
  const br = s.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (br) {
    const dia = br[1];
    const mes = br[2];
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${ano}-${mes}-${dia}`;
  }
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return s;
}

/**
 * Hash estável das colunas que identificam unicamente uma movimentação.
 * Duas extrações do mesmo lançamento produzem o mesmo `id`, garantindo
 * deduplicação idempotente entre execuções diárias.
 */
export function makeMovimentacaoId(parts: {
  conta: string;
  data: string;
  descricao: string;
  valor: number;
  documento?: string;
}): string {
  const key = [
    parts.conta.trim().toLowerCase(),
    parts.data,
    parts.descricao.trim().toLowerCase().replace(/\s+/g, " "),
    parts.valor.toFixed(2),
    (parts.documento ?? "").trim().toLowerCase(),
  ].join("|");
  return "bmp-" + createHash("sha256").update(key).digest("hex").slice(0, 24);
}

/** Normaliza uma linha bruta do extrato em uma `Movimentacao`. */
export function linhaToMovimentacao(
  linha: LinhaExtrato,
  conta: string,
  capturadoEm: number = Date.now(),
): Movimentacao {
  const data = parseDataBR(linha.data);
  const tipo = detectarTipo(linha);
  const valor = parseValorBR(linha.valor);
  const descricao = (linha.descricao ?? "").trim();
  const documento = linha.documento?.trim() || undefined;
  const saldo = linha.saldo ? parseNumeroBR(linha.saldo, { sinal: true }) : undefined;

  return {
    id: makeMovimentacaoId({ conta, data, descricao, valor, documento }),
    conta,
    data,
    descricao,
    documento,
    tipo,
    valor,
    saldo,
    raw: JSON.stringify(linha),
    capturadoEm,
  };
}
