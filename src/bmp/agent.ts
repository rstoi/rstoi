/**
 * Agente Banco BMP — orquestra uma sincronização:
 *   extrair extrato (AntecipaFácil) → normalizar → registrar (SQLite) → log.
 *
 * Idempotente: rodar várias vezes no mesmo dia só adiciona movimentações novas.
 */

import { loadBmpConfig, type BmpConfig } from "./config.js";
import { AntecipaFacilScraper } from "./scraper.js";
import { linhaToMovimentacao } from "./parse.js";
import {
  registrarMovimentacoes,
  iniciarSyncLog,
  concluirSyncLog,
  resumoDoDia,
} from "./store.js";
import type { SyncResult } from "./types.js";

/** Executa uma sincronização completa e registra o resultado no log. */
export async function runSync(cfg: BmpConfig = loadBmpConfig()): Promise<SyncResult> {
  const logId = iniciarSyncLog();
  const scraper = new AntecipaFacilScraper(cfg);
  const capturadoEm = Date.now();

  try {
    await scraper.connect();
    const linhas =
      cfg.extratoFonte === "escrow"
        ? await scraper.scrapeContaConsignada()
        : await scraper.scrapeMovimentacoes();
    const movs = linhas.map((l) => linhaToMovimentacao(l, cfg.conta, capturadoEm));
    const { novas, total } = registrarMovimentacoes(movs);

    concluirSyncLog(logId, { status: "ok", novas, total });
    console.error(`[bmp] Sincronização OK — ${novas} nova(s) de ${total} linha(s).`);
    return { ok: true, novas, total };
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    concluirSyncLog(logId, { status: "erro", erro });
    console.error(`[bmp] Sincronização FALHOU: ${erro}`);
    return { ok: false, novas: 0, total: 0, erro };
  } finally {
    await scraper.disconnect().catch(() => {});
  }
}

/** Linha de resumo legível do dia (para logs/notificações). */
export function resumoLegivel(data?: string): string {
  const r = resumoDoDia(data);
  const brl = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return (
    `📊 BMP ${r.data}: ${r.total} movimentação(ões) — ` +
    `${r.creditos} crédito(s) (${brl(r.totalCredito)}), ` +
    `${r.debitos} débito(s) (${brl(r.totalDebito)})`
  );
}
