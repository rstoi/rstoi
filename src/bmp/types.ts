/**
 * Tipos do agente Banco BMP.
 *
 * O agente acessa a conta corrente BMP através do webapp AntecipaFácil,
 * extrai as movimentações do extrato e as registra localmente (SQLite).
 */

export type TipoMovimentacao = "credito" | "debito";

/** Movimentação normalizada e pronta para registro. */
export interface Movimentacao {
  /** Hash estável das colunas relevantes — usado para deduplicação. */
  id: string;
  /** Identificador/rótulo da conta (ex.: "BMP conta corrente"). */
  conta: string;
  /** Data da movimentação no formato ISO `YYYY-MM-DD`. */
  data: string;
  descricao: string;
  /** Nº do documento / referência, quando disponível. */
  documento?: string;
  tipo: TipoMovimentacao;
  /** Valor sempre positivo; o sinal é representado por `tipo`. */
  valor: number;
  /** Saldo após a movimentação (com sinal), quando o extrato informa. */
  saldo?: number;
  categoria?: string;
  /** JSON da linha bruta extraída, para auditoria. */
  raw?: string;
  /** Epoch (ms) de quando a movimentação foi capturada. */
  capturadoEm: number;
}

/**
 * Linha bruta do extrato, como aparece na tela do AntecipaFácil
 * (strings sem normalização). É o que o scraper entrega.
 */
export interface LinhaExtrato {
  data: string;
  descricao: string;
  documento?: string;
  /** Ex.: "1.234,56", "-1.234,56", "R$ 1.234,56 D". */
  valor: string;
  /** Saldo como texto, quando a coluna existir. */
  saldo?: string;
  /** Dica de tipo quando a tela tem coluna própria (ex.: "C"/"D"/"Crédito"). */
  tipo?: string;
}

export interface SyncResult {
  ok: boolean;
  /** Movimentações novas (não vistas antes) registradas nesta execução. */
  novas: number;
  /** Total de linhas extraídas do extrato nesta execução. */
  total: number;
  erro?: string;
}
