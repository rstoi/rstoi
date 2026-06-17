#!/usr/bin/env tsx
/**
 * Explorador do AntecipaFácil — percorre o app LOGADO (somente leitura) para
 * localizar a página/tabela das transações da conta BMP.
 *
 * Pré-requisitos NESTE ambiente:
 *   1. Egress liberado para dash.antecipafacil.net.br (+ accounts.google.com).
 *   2. Sessão OAuth já gravada (faça uma vez: BMP_HEADLESS=false npm run bmp:sync),
 *      OU rode este explorador com janela visível para logar na hora:
 *        BMP_HEADLESS=false npm run bmp:explore
 *
 * Saída: data/bmp-explore/ (screenshots, HTML e exploracao.json) + sugestão de
 * BMP_AF_EXTRATO_URL e índices BMP_COL_* no terminal.
 */

import { resolve } from "path";
import { loadBmpConfig } from "../src/bmp/config.js";
import { AntecipaFacilScraper } from "../src/bmp/scraper.js";

async function main(): Promise<void> {
  const cfg = loadBmpConfig();
  const outDir = resolve(process.env.BMP_EXPLORE_DIR ?? "./data/bmp-explore");
  const scraper = new AntecipaFacilScraper(cfg);

  console.error("→ Banco BMP: explorando o app AntecipaFácil (somente leitura)…");
  try {
    await scraper.connect();
    const res = await scraper.explorar(outDir);

    console.error("\n=== Links candidatos (extrato/conta/movimentações) ===");
    for (const l of res.links.filter((x) => x.candidato)) {
      console.error(`  • ${l.texto || "(sem texto)"} → ${l.href}`);
    }

    console.error("\n=== Tabelas encontradas por página ===");
    for (const p of res.paginas) {
      if (p.tabelas.length === 0) continue;
      console.error(`\n  [${p.titulo || p.url}]`);
      p.tabelas.forEach((t, i) => {
        console.error(`    tabela#${i} (${t.linhas} linha(s)) headers: ${JSON.stringify(t.headers)}`);
        if (t.amostra[0]) console.error(`      amostra: ${JSON.stringify(t.amostra[0])}`);
      });
    }

    if (res.sugestao) {
      const c = res.sugestao.colunas;
      console.error("\n=== ✅ Provável extrato do BMP detectado — sugestão de config ===");
      console.error(`  BMP_AF_EXTRATO_URL=${res.sugestao.extratoUrl}`);
      if (c.data !== undefined) console.error(`  BMP_COL_DATA=${c.data}`);
      if (c.descricao !== undefined) console.error(`  BMP_COL_DESCRICAO=${c.descricao}`);
      if (c.documento !== undefined) console.error(`  BMP_COL_DOCUMENTO=${c.documento}`);
      if (c.valor !== undefined) console.error(`  BMP_COL_VALOR=${c.valor}`);
      if (c.saldo !== undefined) console.error(`  BMP_COL_SALDO=${c.saldo}`);
      console.error(`  (cabeçalhos: ${JSON.stringify(res.sugestao.headers)})`);
    } else {
      console.error("\n⚠️  Não identifiquei automaticamente uma tabela de extrato.");
      console.error("   Veja os screenshots/HTML em data/bmp-explore/ e ajuste BMP_SEL_*/BMP_COL_* manualmente.");
    }

    console.error(`\n→ Artefatos salvos em ${outDir}`);
  } catch (err) {
    console.error("✗ Falha:", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    await scraper.disconnect().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
