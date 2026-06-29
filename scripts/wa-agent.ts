#!/usr/bin/env tsx
/**
 * WhatsApp Setup Agent
 *
 * Monitora mensagens WhatsApp para comandos /setup e os interpreta
 * e executa via Claude API (claude-opus-4-8) com ferramenta bash.
 *
 * Pré-requisitos:
 *   - ANTHROPIC_API_KEY configurada
 *   - Chrome/Chromium instalado (npm run setup:chrome)
 *   - Sessão WhatsApp ativa (npm run connect)
 *
 * Uso: npm run agent
 * Ou:  ANTHROPIC_API_KEY=sk-ant-... WA_ADAPTER=playwright tsx scripts/wa-agent.ts
 */

import { PlaywrightClient } from "../src/adapters/playwright/client.js";
import { guardAdapter } from "../src/guard.js";
import { parseCsv, isAuthorized } from "../src/agent-auth.js";
import { interpretCommand } from "../src/agent/interpret.js";
import { closeDb } from "../src/store/db.js";
import type { WhatsAppAdapter } from "../src/adapters/base.js";
import type { Message } from "../src/types/index.js";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";
const CMD_PREFIX = "/setup";
const MAX_REPLY_LEN = 3800;

// Controles de segurança do /setup (RCE) — ver src/agent-auth.ts.
const AGENT_GROUPS = parseCsv(process.env.WA_AGENT_GROUPS);          // grupos onde responde
const ALLOWED_SENDERS = parseCsv(process.env.WA_AGENT_ALLOWED_SENDERS); // quem pode disparar

const HELP_TEXT = [
  "🛠️ *Agente Setup — comandos aceitos no WhatsApp*",
  "",
  "Use: */setup <pedido>* — eu interpreto e executo no projeto, e respondo o resultado.",
  "",
  "*Exemplos:*",
  "• */setup status do projeto*",
  "• */setup rode os testes*",
  "• */setup como está o git*",
  "• */setup faça o build e diga se passou*",
  "• */setup* (sozinho) → status do projeto",
  "• */setup ajuda* → mostra esta ajuda",
  "",
  "ℹ️ Funciona apenas nos grupos autorizados e para membros deles.",
].join("\n");

// ── Message handler ───────────────────────────────────────────────────────────

async function handleMessage(adapter: WhatsAppAdapter, msg: Message): Promise<void> {
  // Autorização (deny por padrão): aceita /setup de membros de um grupo
  // escopado (WA_AGENT_GROUPS) ou de um remetente explicitamente autorizado.
  let groupName = "";
  if (msg.isGroup && typeof msg.chatId === "string" && msg.chatId.endsWith("@g.us")) {
    try { groupName = (await adapter.getGroup(msg.chatId))?.name ?? ""; } catch { /* best-effort */ }
  }
  if (!isAuthorized({ chatId: msg.chatId, groupName, fromId: msg.fromId, groups: AGENT_GROUPS, senders: ALLOWED_SENDERS })) {
    console.error(`[agent] negado (fora do escopo/não autorizado): ${groupName || msg.chatId} / ${msg.fromId}`);
    return; // silencioso
  }

  const command = msg.text!.slice(CMD_PREFIX.length).trim() || "status do projeto";
  console.error(`[agent] /setup de ${msg.fromId} (${groupName || msg.chatId}): ${command}`);

  // Ajuda: lista os comandos aceitos sem executar nada.
  if (/^(ajuda|help|\?|comandos)$/i.test(command)) {
    await adapter.sendMessage(msg.chatId, { text: HELP_TEXT }).catch(() => {});
    return;
  }

  // Acknowledge
  try {
    await adapter.sendMessage(msg.chatId, { text: `⏳ Executando: _${command}_` });
  } catch { /* best-effort */ }

  try {
    const answer = await interpretCommand(command, { model: MODEL });
    const truncated = answer.length > MAX_REPLY_LEN
      ? answer.slice(0, MAX_REPLY_LEN) + "\n\n…(truncado)"
      : answer;
    await adapter.sendMessage(msg.chatId, { text: `✅ ${truncated}` });
  } catch (err: unknown) {
    const msg2 = err instanceof Error ? err.message : String(err);
    console.error("[agent] Erro ao processar:", msg2);
    try {
      await adapter.sendMessage(msg.chatId, {
        text: `❌ Erro: ${msg2.slice(0, 200)}`,
      });
    } catch { /* give up */ }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.error("\n╔══════════════════════════════════════════════════╗");
  console.error(  "║  WhatsApp Setup Agent                             ║");
  console.error(  "║  Aguardando comandos /setup no WhatsApp...        ║");
  console.error(  "╚══════════════════════════════════════════════════╝\n");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("✗ ANTHROPIC_API_KEY não configurada. Defina no .env ou exporte antes de rodar.");
    process.exit(1);
  }

  // Envolve o cliente no guard: o agente NÃO processa nem responde mensagens de
  // grupos bloqueados (WA_BLOCKED_GROUPS, ex.: financasfacil). O onMessage
  // recebido já vem filtrado e o sendMessage de resposta também é barrado.
  const adapter = guardAdapter(new PlaywrightClient());
  const startedAt = Date.now();

  // onMessage is called for every new incoming message scraped from WhatsApp Web
  adapter.onMessage = (msg: Message) => {
    if (msg.timestamp < startedAt) return;          // skip messages before startup
    if (msg.isFromMe) return;                        // ignore own messages
    if (!msg.text?.startsWith(CMD_PREFIX)) return;  // only /setup commands

    // Fire-and-forget; errors are caught inside handleMessage
    handleMessage(adapter, msg).catch(console.error);
  };

  console.error("→ Iniciando Chromium e abrindo web.whatsapp.com…\n");
  try {
    await adapter.connect();
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : String(err);
    console.error("✗ Falha ao conectar:", m);
    process.exit(1);
  }

  console.error(`\n✓ Conectado! Monitorando mensagens (modelo: ${MODEL})…`);
  console.error(`  Envie "/setup <comando>" no WhatsApp para acionar o agente.\n`);

  process.on("SIGINT", async () => {
    console.error("\n→ Encerrando agente…");
    await adapter.disconnect().catch(() => {});
    closeDb();
    process.exit(0);
  });

  // Keep alive indefinitely
  await new Promise<void>(() => {});
}

main().catch(e => { console.error(e); process.exit(1); });
