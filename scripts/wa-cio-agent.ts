#!/usr/bin/env tsx
/**
 * Agente CIO — Resumo Executivo Diário
 *
 * Coleta a situação atual do projeto (git, testes, recursos, rede, WhatsApp),
 * pede a um modelo Claude — com persona de CIO experiente e abordagem AI-first —
 * para sintetizar um resumo executivo, e envia para o grupo de WhatsApp
 * configurado (padrão: "Baita TI").
 *
 * Execução pontual (não fica em loop): pensado para ser disparado por um
 * agendador externo (cron/trigger da plataforma) todo dia às 8:00 — o
 * container deste projeto é efêmero e não deve manter processos de longa
 * duração para isso (ver docs/RESILIENCIA.md).
 *
 * Pré-requisitos:
 *   - ANTHROPIC_API_KEY configurada
 *   - Sessão WhatsApp ativa (npm run connect)
 *
 * Uso: npm run cio-report
 * Ou:  ANTHROPIC_API_KEY=sk-ant-... WA_ADAPTER=playwright tsx scripts/wa-cio-agent.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { PlaywrightClient } from "../src/adapters/playwright/client.js";
import { guardAdapter } from "../src/guard.js";
import { collectSituacao } from "../src/cio/collect-status.js";
import { buildCioSystemPrompt, buildCioUserPrompt } from "../src/cio/summary.js";
import { closeDb } from "../src/store/db.js";
import type { WhatsAppAdapter } from "../src/adapters/base.js";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";
const CIO_GROUP = process.env.WA_CIO_GROUP ?? "Baita TI";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function buildSummary(): Promise<string> {
  const situacao = collectSituacao();
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: buildCioSystemPrompt(),
    messages: [{ role: "user", content: buildCioUserPrompt(situacao) }],
  });
  const text = resp.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  return text?.trim() || "Não foi possível gerar o resumo executivo hoje.";
}

async function findGroupChatId(adapter: WhatsAppAdapter, name: string): Promise<string | null> {
  const groups = await adapter.listGroups();
  const target = name.trim().toLowerCase();
  return groups.find((g) => g.name.trim().toLowerCase() === target)?.id ?? null;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("✗ ANTHROPIC_API_KEY não configurada. Defina no .env ou exporte antes de rodar.");
    process.exit(1);
  }

  console.error(`→ Agente CIO: coletando situação e gerando resumo executivo (${new Date().toLocaleString("pt-BR")})…`);
  const summary = await buildSummary();

  // guardAdapter impede que o agente veja/atinja grupos em WA_BLOCKED_GROUPS.
  const adapter = guardAdapter(new PlaywrightClient());
  try {
    console.error("→ Conectando ao WhatsApp…");
    await adapter.connect();

    const chatId = await findGroupChatId(adapter, CIO_GROUP);
    if (!chatId) {
      console.error(`✗ Grupo "${CIO_GROUP}" não encontrado (ou bloqueado por política). Resumo não enviado.`);
      process.exitCode = 1;
      return;
    }

    await adapter.sendMessage(chatId, {
      text: `🧭 *Resumo Executivo — Agente CIO*\n\n${summary}`,
    });
    console.error(`✓ Resumo enviado para "${CIO_GROUP}".`);
  } finally {
    await adapter.disconnect().catch(() => {});
    closeDb();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
