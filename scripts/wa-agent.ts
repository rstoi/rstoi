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

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import { PlaywrightClient } from "../src/adapters/playwright/client.js";
import { guardAdapter } from "../src/guard.js";
import { closeDb } from "../src/store/db.js";
import type { WhatsAppAdapter } from "../src/adapters/base.js";
import type { Message } from "../src/types/index.js";

const PROJECT_DIR = process.env.PROJECT_DIR ?? "/home/user/rstoi";
const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";
const CMD_PREFIX = "/setup";
const MAX_REPLY_LEN = 3800;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Tool execution ────────────────────────────────────────────────────────────

function runBash(command: string): string {
  try {
    const out = execSync(command, {
      cwd: PROJECT_DIR,
      timeout: 60_000,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return out.trim() || "(sem saída)";
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const detail = [e.stdout, e.stderr, e.message].filter(Boolean).join("\n").trim();
    return `ERRO: ${detail || "falha desconhecida"}`;
  }
}

// ── Claude agentic loop ───────────────────────────────────────────────────────

async function askClaude(userText: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: userText,
    },
  ];

  const tools: Anthropic.Tool[] = [
    {
      name: "bash",
      description: `Executa um comando bash no projeto em ${PROJECT_DIR}. Use para ler arquivos, rodar scripts npm, git, etc.`,
      input_schema: {
        type: "object",
        properties: {
          command: { type: "string", description: "Comando bash a executar" },
        },
        required: ["command"],
      },
    },
  ];

  const systemPrompt = `Você é o Agente Setup do projeto whatsapp-business-mcp em ${PROJECT_DIR}.
Interprete o comando do usuário e execute as ações necessárias usando a ferramenta bash.
Scripts disponíveis: npm run build | test | dev | connect | agent | typecheck
Responda sempre em português, de forma concisa e direta.
Se o comando for ambíguo, execute o que faz mais sentido e explique brevemente o que fez.`;

  let lastText = "";
  let rounds = 0;

  while (rounds < 8) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: systemPrompt,
      tools,
      messages,
    });

    for (const block of resp.content) {
      if (block.type === "text") lastText = block.text;
    }

    if (resp.stop_reason === "end_turn") break;

    if (resp.stop_reason === "tool_use") {
      const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) break;

      messages.push({ role: "assistant", content: resp.content });

      const results: Anthropic.ToolResultBlockParam[] = toolUses.map(tu => {
        const input = tu.input as { command: string };
        console.error(`[agent] $ ${input.command}`);
        const output = runBash(input.command);
        const preview = output.slice(0, 300).replace(/\n/g, " ");
        console.error(`[agent] → ${preview}`);
        return {
          type: "tool_result",
          tool_use_id: tu.id,
          content: output.slice(0, 10_000),
        };
      });

      messages.push({ role: "user", content: results });
      rounds++;
    } else {
      break;
    }
  }

  return lastText || "Concluído.";
}

// ── Message handler ───────────────────────────────────────────────────────────

async function handleMessage(adapter: WhatsAppAdapter, msg: Message): Promise<void> {
  const command = msg.text!.slice(CMD_PREFIX.length).trim() || "status do projeto";
  console.error(`[agent] /setup de ${msg.fromId}: ${command}`);

  // Acknowledge
  try {
    await adapter.sendMessage(msg.chatId, { text: `⏳ Executando: _${command}_` });
  } catch { /* best-effort */ }

  try {
    const answer = await askClaude(command);
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
