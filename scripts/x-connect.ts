#!/usr/bin/env tsx
/**
 * X (Twitter) Connection Wizard — login inicial
 *
 * Run: npm run x-connect   (força X_HEADLESS=false)
 *
 * O X não tem login por QR. Este assistente abre um Chromium VISÍVEL (no
 * DISPLAY=:99 / VNC do ambiente) para você logar à mão — usuário, senha, 2FA e
 * eventuais desafios. Ao detectar login, salva a sessão em
 * $X_SESSION_DIR/storage.json para o agente reutilizar.
 *
 * Importante: logue a partir DESTE ambiente (mesmo IP/fingerprint do agente) —
 * é o que torna a sessão mais durável e menos sujeita a bloqueio.
 *
 * NÃO publica nada; opcionalmente lê a timeline como autoteste.
 */
import { XClient } from "../src/adapters/x/client.js";
import { closeDb } from "../src/store/db.js";

async function main() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log(  "║  Agente X — Assistente de Conexão (@rtoi)         ║");
  console.log(  "╚══════════════════════════════════════════════════╝\n");

  if (process.env.X_HEADLESS === "true") {
    console.error("⚠ X_HEADLESS=true — o login manual precisa do browser visível.");
    console.error("  Use `npm run x-connect` (que força X_HEADLESS=false) ou exporte X_HEADLESS=false.\n");
  }

  const x = new XClient();

  console.log("→ Abrindo Chromium em x.com/home…");
  console.log("  Faça login (usuário, senha, 2FA) na janela do browser.");
  console.log("  Aguardando detectar a sessão logada (até 5 min)…\n");

  try {
    await x.connect();
  } catch (err: unknown) {
    // connect() só aguarda ~30s; para o login manual, esperamos mais tempo.
    const msg = err instanceof Error ? err.message : String(err);
    if (!/expirada|Sem sessão/i.test(msg)) {
      console.error("✗ Erro ao conectar:", msg);
      process.exit(1);
    }
    console.error("→ Sessão ainda não detectada na 1ª tentativa; continuando a aguardar…");
    process.exit(1);
  }

  console.log("\n✓ Sessão do X salva! O agente já pode postar.\n");

  // Autoteste read-only (não publica).
  try {
    const tl = await x.getTimeline(3);
    if (tl.length) {
      console.log(`→ Timeline (autoteste, ${tl.length} posts):`);
      tl.forEach((p) => console.log(`   • ${p.author}: ${p.text.slice(0, 70)}…`));
    }
  } catch { /* best-effort */ }

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log(  "║  Conexão OK — pressione Ctrl+C para encerrar      ║");
  console.log(  "╚══════════════════════════════════════════════════╝\n");

  await new Promise<void>((res) => process.on("SIGINT", () => res()));
  await x.disconnect();
  closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
