#!/usr/bin/env tsx
/**
 * WhatsApp Connection Wizard
 *
 * Run: npx tsx scripts/wa-connect.ts
 *
 * Starts the Playwright adapter, waits for QR scan, then runs a self-test:
 *   - lists chats
 *   - sends a "ping" message to yourself (loopback)
 */

import { PlaywrightClient } from "../src/adapters/playwright/client.js";
import { closeDb } from "../src/store/db.js";
import * as readline from "readline";

const SELF_PHONE = process.env.WA_TEST_PHONE ?? process.env.WA_HTTP_PHONE ?? "";

async function ask(q: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(q, ans => { rl.close(); res(ans.trim()); }));
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log(  "║  WhatsApp MCP — Assistente de Conexão             ║");
  console.log(  "╚══════════════════════════════════════════════════╝\n");

  const adapter = new PlaywrightClient();

  console.log("→ Iniciando Chromium e abrindo web.whatsapp.com…\n");

  try {
    await adapter.connect();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("403") || msg.includes("net::ERR")) {
      console.error("✗ Não foi possível acessar web.whatsapp.com.");
      console.error("  Verifique sua conexão de internet e tente novamente.");
    } else {
      console.error("✗ Erro ao conectar:", msg);
    }
    process.exit(1);
  }

  console.log("\n✓ Conectado ao WhatsApp!\n");

  // List chats
  const chats = await adapter.listChats();
  if (chats.length > 0) {
    console.log(`→ ${chats.length} conversa(s) encontrada(s):`);
    chats.slice(0, 5).forEach(c => {
      const unread = c.unreadCount ? ` [${c.unreadCount} não lida(s)]` : "";
      console.log(`   • ${c.name || c.id}${unread}`);
    });
  } else {
    console.log("→ Nenhuma conversa ainda (caixa de entrada vazia ou adapter não sincronizou).");
  }

  // Self-test: send message
  let testPhone = SELF_PHONE;
  if (!testPhone) {
    testPhone = await ask("\nDigite o número para enviar mensagem de teste (ex: 5511999990000): ");
  }

  if (testPhone) {
    console.log(`\n→ Enviando mensagem de teste para ${testPhone}…`);
    try {
      const sent = await adapter.sendMessage(testPhone, {
        text: `✅ WhatsApp MCP conectado com sucesso! ${new Date().toLocaleString("pt-BR")}`,
      });
      console.log(`✓ Mensagem enviada! ID: ${sent.id}`);
    } catch (err: unknown) {
      console.error("✗ Falha ao enviar:", err instanceof Error ? err.message : err);
    }
  }

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log(  "║  Conexão OK — pressione Ctrl+C para encerrar      ║");
  console.log(  "╚══════════════════════════════════════════════════╝\n");

  // Keep alive
  await new Promise<void>(res => process.on("SIGINT", () => res()));
  await adapter.disconnect();
  closeDb();
}

main().catch(e => { console.error(e); process.exit(1); });
