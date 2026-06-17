#!/usr/bin/env tsx
/**
 * Sincronização única do Banco BMP (AntecipaFácil) — roda agora e sai.
 *
 * Uso:
 *   npm run bmp:sync
 *   BMP_AF_USER=... BMP_AF_PASSWORD=... tsx scripts/bmp-sync.ts
 *
 * Ideal para ser disparado por um gatilho agendado da plataforma às 01:00
 * (autonomia diária resiliente a reboots — ver docs/BANCO-BMP.md).
 */

import { runSync, resumoLegivel } from "../src/bmp/agent.js";
import { closeBmpDb } from "../src/bmp/store.js";

async function main(): Promise<void> {
  console.error("→ Banco BMP: iniciando sincronização do extrato…");
  const res = await runSync();
  if (res.ok) {
    console.error(resumoLegivel());
  }
  closeBmpDb();
  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
