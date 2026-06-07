#!/usr/bin/env tsx
/**
 * Executa a rotina diária completa de tesouraria com agentes de IA.
 * Requer ANTHROPIC_API_KEY.
 */
import "dotenv/config";
import { TreasuryOrchestrator } from "../src/treasury/agents/orchestrator.js";
import { getDb } from "../src/store/db.js";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY não configurada.");
  console.error("   Exporte a variável e tente novamente:");
  console.error("   export ANTHROPIC_API_KEY=sk-ant-...");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
console.log(`\n🤖 Iniciando rotina de tesouraria com IA${dryRun ? " (DRY RUN)" : ""}...`);

// Garante que o banco e as tabelas existem
getDb();

const orchestrator = new TreasuryOrchestrator();
const results = await orchestrator.runDailyRoutine({ dryRun });

console.log("\n📊 Resultado da rotina:\n");
for (const r of results) {
  console.log(`  ${r.agent}`);
  console.log(`    Decisões:         ${r.decisions.length}`);
  console.log(`    Executadas:       ${r.executedCount}`);
  console.log(`    Aguard. aprovação:${r.pendingApprovalCount}`);
  for (const d of r.decisions.filter(d => d.action !== "agent_summary")) {
    const icon = d.executed ? "✅" : d.requiresApproval ? "⏳" : "ℹ️ ";
    console.log(`    ${icon} [${d.action}] ${d.justification?.slice(0, 80) ?? ""}`);
  }
  console.log();
}

const total = results.reduce((s, r) => s + r.executedCount, 0);
const pending = results.reduce((s, r) => s + r.pendingApprovalCount, 0);
console.log(`✅ Rotina concluída — ${total} ação(ões) executada(s), ${pending} aguardando aprovação.\n`);
