#!/usr/bin/env node
/**
 * Exportador de extratos do Banco do Brasil — para rodar NA SUA MÁQUINA.
 *
 * Abre um navegador real (Chromium via Playwright) com um perfil persistente,
 * VOCÊ faz o login manualmente (agência, conta, senha, token/app) e navega até
 * "Extrato de conta corrente". O script não toca nas suas credenciais: ele só
 *
 *   1. mantém o perfil/registro do dispositivo entre execuções (menos token);
 *   2. captura automaticamente todo arquivo baixado (PDF/OFX/CSV/TXT) e salva
 *      numa pasta organizada, já pronto para o parse_extrato.py.
 *
 * Por que semiautomático? O login do BB usa teclado virtual, token no app e
 * reconhecimento de dispositivo — automatizar isso seria frágil e inseguro.
 * Aqui a automação cuida só do trabalho chato (baixar e organizar arquivos).
 *
 * Uso:
 *   npm i playwright            # se ainda não tiver
 *   npx playwright install chromium
 *   node bb_export.mjs --out ./extratos --profile ./.bb-profile
 *
 * Depois, processe o que baixou:
 *   python3 parse_extrato.py ./extratos --outdir output
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const OUT = resolve(arg("out", "./extratos"));
const PROFILE = resolve(arg("profile", "./.bb-profile"));
const START_URL = arg("url", "https://www.bb.com.br/");

mkdirSync(OUT, { recursive: true });

function sanitize(name) {
  return name.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
}

console.log("┌──────────────────────────────────────────────────────────┐");
console.log("│  Exportador de extratos — Banco do Brasil (semiautomático) │");
console.log("└──────────────────────────────────────────────────────────┘");
console.log(`Downloads serão salvos em: ${OUT}`);
console.log(`Perfil do navegador (mantém login/dispositivo): ${PROFILE}\n`);

const context = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  acceptDownloads: true,
  viewport: { width: 1280, height: 900 },
  locale: "pt-BR",
});

// Captura downloads de qualquer aba/página do contexto.
function wireDownloads(page) {
  page.on("download", async (download) => {
    const suggested = sanitize(download.suggestedFilename() || "extrato");
    const stamped = `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}_${suggested}`;
    const dest = resolve(OUT, stamped);
    try {
      await download.saveAs(dest);
      console.log(`  ✓ salvo: ${dest}`);
    } catch (err) {
      console.log(`  ✗ falha ao salvar ${suggested}: ${err.message}`);
    }
  });
}

context.on("page", wireDownloads);
const page = context.pages()[0] ?? (await context.newPage());
wireDownloads(page);

await page.goto(START_URL, { waitUntil: "domcontentloaded" }).catch(() => {});

console.log("PRÓXIMOS PASSOS (no navegador que abriu):");
console.log("  1. Faça login normalmente (Conta PJ / Empresarial).");
console.log("  2. Vá em Conta corrente › Extrato e escolha o período.");
console.log('  3. Clique em "Salvar/Exportar" e escolha PDF, OFX, CSV ou TXT.');
console.log("  4. Repita para cada mês desejado — tudo cai na pasta de downloads.");
console.log("\nQuando terminar, feche o navegador ou pressione Ctrl+C aqui.\n");

// Mantém o processo vivo até a janela ser fechada ou Ctrl+C.
await new Promise((done) => {
  context.on("close", done);
  process.on("SIGINT", () => {
    console.log("\nEncerrando…");
    done();
  });
});

await context.close().catch(() => {});
console.log(`\nPronto. Arquivos em ${OUT}`);
console.log(`Agora rode:  python3 parse_extrato.py "${OUT}" --outdir output`);
