#!/usr/bin/env tsx
/**
 * WhatsApp Business Cloud API — Setup Wizard
 *
 * Executa todos os passos necessários para habilitar a integração:
 * 1. Valida credenciais Meta (se fornecidas)
 * 2. Sobe o servidor webhook local
 * 3. Abre túnel público via ngrok (ou instrui sobre exposição manual)
 * 4. Verifica a integração ponta-a-ponta
 */
import "./config.js";
import axios from "axios";
import express from "express";
import crypto from "crypto";
import { getDb } from "./store/db.js";
import { createWebhookServer } from "./webhook.js";
import { CloudApiClient } from "./adapters/cloud-api/index.js";

// ── Cores ANSI ──────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m",
  cyan: "\x1b[36m", blue: "\x1b[34m", magenta: "\x1b[35m",
  bgBlue: "\x1b[44m", bgGreen: "\x1b[42m", bgRed: "\x1b[41m", white: "\x1b[37m",
};

const ok   = `${c.green}✓${c.reset}`;
const fail = `${c.red}✗${c.reset}`;
const info = `${c.cyan}ℹ${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;
const step = (n: number, t: string) => `\n${c.bold}${c.bgBlue}${c.white} ${n} ${c.reset}${c.bold} ${t}${c.reset}`;

// ── Helpers ──────────────────────────────────────────────────────────────────
function env(key: string): string { return process.env[key] ?? ""; }
function masked(s: string): string { return s ? s.slice(0, 6) + "…" + s.slice(-4) : "(não definido)"; }

async function checkCredential(label: string, value: string): Promise<boolean> {
  const has = Boolean(value);
  console.log(`  ${has ? ok : fail} ${label}: ${has ? masked(value) : `${c.red}não definido${c.reset}`}`);
  return has;
}

async function testGraphAPI(token: string, phoneId: string): Promise<{ ok: boolean; name?: string; phone?: string; error?: string }> {
  try {
    const res = await axios.get(
      `https://graph.facebook.com/v21.0/${phoneId}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 },
    );
    return { ok: true, name: res.data.display_phone_number, phone: res.data.verified_name };
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: { message?: string } } } };
    return { ok: false, error: err.response?.data?.error?.message ?? String(e) };
  }
}

async function sendTestMessage(token: string, phoneId: string, to: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const res = await axios.post(
      `https://graph.facebook.com/v21.0/${phoneId}/messages`,
      { messaging_product: "whatsapp", to, type: "text", text: { body: text } },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 8000 },
    );
    return { ok: true, id: res.data.messages?.[0]?.id };
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: { message?: string } } } };
    return { ok: false, error: err.response?.data?.error?.message ?? String(e) };
  }
}

async function tryNgrokTunnel(port: number): Promise<string | null> {
  try {
    // @ts-ignore — optional dev dependency
    const ngrok = await import("@ngrok/ngrok");
    const ngrokToken = env("NGROK_AUTHTOKEN");
    if (!ngrokToken) return null;
    console.log(`  ${info} Abrindo túnel ngrok...`);
    const url = await ngrok.connect({ addr: port, authtoken: ngrokToken });
    return typeof url === "string" ? url : (url as { url(): string }).url();
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`\n${c.bold}${c.bgBlue}${c.white}  WhatsApp Business Cloud API — Setup Wizard  ${c.reset}\n`);

  // ── PASSO 1: Verificar credenciais ─────────────────────────────────────────
  console.log(step(1, "Verificando credenciais no .env"));

  const token   = env("WA_ACCESS_TOKEN");
  const phoneId = env("WA_PHONE_NUMBER_ID");
  const bizId   = env("WA_BUSINESS_ACCOUNT_ID");
  const vToken  = env("WA_WEBHOOK_VERIFY_TOKEN");
  const wSecret = env("WA_WEBHOOK_SECRET");
  const adapter = env("WA_ADAPTER") || "baileys";

  await checkCredential("WA_ACCESS_TOKEN",        token);
  await checkCredential("WA_PHONE_NUMBER_ID",      phoneId);
  await checkCredential("WA_BUSINESS_ACCOUNT_ID",  bizId);
  await checkCredential("WA_WEBHOOK_VERIFY_TOKEN", vToken);
  await checkCredential("WA_WEBHOOK_SECRET",       wSecret);
  console.log(`  ${adapter === "cloud-api" ? ok : warn} WA_ADAPTER: ${c.bold}${adapter}${c.reset}${adapter !== "cloud-api" ? ` ${c.yellow}← trocar para cloud-api${c.reset}` : ""}`);

  const hasCredentials = Boolean(token && phoneId);

  if (!hasCredentials) {
    console.log(`\n${c.yellow}${c.bold}  Credenciais ausentes. Siga os passos abaixo para obtê-las:${c.reset}\n`);
    printSetupInstructions();
    await runWebhookServerOnly(vToken || "meu-token-verificacao");
    return;
  }

  // ── PASSO 2: Testar conexão com a API Meta ─────────────────────────────────
  console.log(step(2, "Testando conexão com Meta Graph API"));
  const apiTest = await testGraphAPI(token, phoneId);
  if (apiTest.ok) {
    console.log(`  ${ok} Conectado! Número: ${c.bold}${apiTest.name}${c.reset} | Conta: ${c.bold}${apiTest.phone}${c.reset}`);
  } else {
    console.log(`  ${fail} Erro na API: ${c.red}${apiTest.error}${c.reset}`);
    console.log(`  ${info} Verifique o token e o Phone Number ID no .env`);
    process.exit(1);
  }

  // ── PASSO 3: Iniciar servidor webhook ──────────────────────────────────────
  console.log(step(3, "Iniciando servidor webhook"));
  getDb();
  const adapter_instance = new CloudApiClient();
  await adapter_instance.connect();
  const app = createWebhookServer(adapter_instance);
  const port = parseInt(env("WEBHOOK_PORT") || "3000", 10);
  await new Promise<void>(resolve => app.listen(port, () => {
    console.log(`  ${ok} Webhook Express rodando em :${c.bold}${port}${c.reset}`);
    resolve();
  }));

  // ── PASSO 4: Abrir túnel público ───────────────────────────────────────────
  console.log(step(4, "Abrindo túnel público para o webhook"));
  const tunnelUrl = await tryNgrokTunnel(port);
  let webhookPublicUrl: string;

  if (tunnelUrl) {
    webhookPublicUrl = `${tunnelUrl}/webhook`;
    console.log(`  ${ok} Túnel ngrok: ${c.bold}${c.cyan}${webhookPublicUrl}${c.reset}`);
  } else {
    webhookPublicUrl = `https://SEU-DOMINIO.com/webhook`;
    console.log(`  ${warn} ngrok não configurado (NGROK_AUTHTOKEN ausente)`);
    console.log(`  ${info} Webhook URL local: ${c.bold}http://localhost:${port}/webhook${c.reset}`);
    console.log(`  ${info} Para expor publicamente: defina ${c.cyan}NGROK_AUTHTOKEN${c.reset} no .env`);
  }

  // ── PASSO 5: Instruções de configuração no Meta Dashboard ─────────────────
  console.log(step(5, "Configuração no Meta Developer Dashboard"));
  console.log(`\n  Configure o webhook no painel Meta com os dados abaixo:`);
  console.log(`\n  ${c.bold}URL do Webhook:${c.reset}`);
  console.log(`  ${c.cyan}${c.bold}  ${webhookPublicUrl}${c.reset}`);
  console.log(`\n  ${c.bold}Token de Verificação:${c.reset}`);
  console.log(`  ${c.cyan}${c.bold}  ${vToken || "meu-token-verificacao"}${c.reset}`);
  console.log(`\n  ${c.bold}Campos a assinar (Webhook Fields):${c.reset}`);
  console.log(`  ${c.dim}  messages, message_deliveries, message_reads${c.reset}`);
  console.log(`\n  ${info} Acesse: ${c.cyan}https://developers.facebook.com/apps/${c.reset}`);

  // ── PASSO 6: Enviar mensagem de teste ──────────────────────────────────────
  console.log(step(6, "Enviando mensagem de teste"));

  // Tenta enviar para o próprio número (teste de loopback)
  const testTo = env("WA_TEST_PHONE") || phoneId;
  const testText = `✅ WhatsApp Business MCP configurado com sucesso! ${new Date().toLocaleString("pt-BR")}`;

  console.log(`  ${info} Enviando para: ${c.bold}${testTo}${c.reset}`);
  const sendResult = await sendTestMessage(token, phoneId, testTo, testText);

  if (sendResult.ok) {
    console.log(`  ${ok} ${c.green}Mensagem enviada!${c.reset} ID: ${c.dim}${sendResult.id}${c.reset}`);
  } else {
    console.log(`  ${warn} Não enviado: ${c.yellow}${sendResult.error}${c.reset}`);
    console.log(`  ${info} Defina WA_TEST_PHONE=<número_destinatário> no .env para testar envio`);
  }

  // ── PASSO 7: Health check ──────────────────────────────────────────────────
  console.log(step(7, "Health check final"));
  try {
    const health = await axios.get(`http://localhost:${port}/health`, { timeout: 2000 });
    console.log(`  ${ok} /health: ${JSON.stringify(health.data)}`);
  } catch (e) {
    console.log(`  ${fail} /health falhou`);
  }

  // ── Resumo ─────────────────────────────────────────────────────────────────
  console.log(`\n${c.bold}${"─".repeat(56)}${c.reset}`);
  console.log(`\n  ${c.bold}${c.bgGreen}${c.white}  SETUP COMPLETO  ${c.reset}  Servidor webhook ativo\n`);
  console.log(`  ${c.cyan}Webhook URL:${c.reset}    ${webhookPublicUrl}`);
  console.log(`  ${c.cyan}Health:${c.reset}         http://localhost:${port}/health`);
  console.log(`  ${c.cyan}Banco:${c.reset}          ${env("SQLITE_DB_PATH") || "./data/whatsapp.db"}`);
  console.log(`\n  ${info} Servidor em execução. Ctrl+C para parar.\n`);

  // Mantém o servidor vivo
  await new Promise(() => {});
}

// ── Modo sem credenciais: sobe apenas o webhook para teste ──────────────────
async function runWebhookServerOnly(verifyToken: string): Promise<void> {
  console.log(step(3, "Iniciando webhook de demonstração (sem credenciais)"));

  const app = express();
  app.use(express.json());

  app.get("/webhook", (req, res) => {
    const mode      = req.query["hub.mode"];
    const token     = req.query["hub.verify_token"] as string;
    const challenge = req.query["hub.challenge"] as string;
    if (mode === "subscribe" && token === verifyToken) {
      console.log(`  ${ok} Webhook verificado pela Meta!`);
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  app.post("/webhook", (req, res) => {
    console.log(`  ${info} Mensagem recebida:`, JSON.stringify(req.body).slice(0, 120));
    res.sendStatus(200);
  });

  app.get("/health", (_req, res) => res.json({ status: "ok", mode: "demo" }));

  const port = parseInt(env("WEBHOOK_PORT") || "3000", 10);
  await new Promise<void>(resolve => app.listen(port, () => {
    console.log(`  ${ok} Demo webhook em :${c.bold}${port}${c.reset}`);
    resolve();
  }));

  const tunnelUrl = await tryNgrokTunnel(port);
  const webhookUrl = tunnelUrl ? `${tunnelUrl}/webhook` : `http://localhost:${port}/webhook`;

  console.log(`\n  ${c.bold}${c.bgBlue}${c.white}  Webhook pronto  ${c.reset}`);
  console.log(`  URL pública: ${c.cyan}${c.bold}${webhookUrl}${c.reset}`);
  console.log(`  Verify token: ${c.cyan}${c.bold}${verifyToken}${c.reset}`);
  console.log(`\n  ${info} Servidor aguardando. Ctrl+C para parar.\n`);
  await new Promise(() => {});
}

// ── Instruções passo-a-passo para obter credenciais ─────────────────────────
function printSetupInstructions(): void {
  console.log(`${c.bold}${c.yellow}  ┌─────────────────────────────────────────────────────────┐${c.reset}`);
  console.log(`${c.bold}${c.yellow}  │  Como obter credenciais Meta WhatsApp Business Cloud API │${c.reset}`);
  console.log(`${c.bold}${c.yellow}  └─────────────────────────────────────────────────────────┘${c.reset}\n`);

  const steps = [
    ["Criar conta Meta Developer",
     "https://developers.facebook.com → Login com conta Facebook → Create App"],
    ["Criar app do tipo 'Business'",
     "Selecione 'Business' → Em 'Add product' adicione 'WhatsApp'"],
    ["Obter WA_PHONE_NUMBER_ID",
     "WhatsApp → API Setup → Phone Number ID (campo 'From')"],
    ["Obter WA_BUSINESS_ACCOUNT_ID",
     "WhatsApp → API Setup → WhatsApp Business Account ID"],
    ["Gerar WA_ACCESS_TOKEN",
     "WhatsApp → API Setup → Temporary access token (24h)\n     Para produção: criar System User com token permanente"],
    ["Configurar webhook",
     "WhatsApp → Configuration → Webhook → Edit\n     URL: <esta máquina ou servidor>/webhook\n     Verify Token: qualquer string segura"],
    ["Definir no .env",
     "WA_ADAPTER=cloud-api\n     WA_ACCESS_TOKEN=<token>\n     WA_PHONE_NUMBER_ID=<id>\n     WA_BUSINESS_ACCOUNT_ID=<id>\n     WA_WEBHOOK_VERIFY_TOKEN=<seu-token>\n     WA_TEST_PHONE=<numero-para-teste-com-DDI>"],
  ];

  steps.forEach(([title, detail], i) => {
    console.log(`  ${c.bold}${c.cyan}${i + 1}.${c.reset} ${c.bold}${title}${c.reset}`);
    detail.split("\n").forEach(line => console.log(`     ${c.dim}${line}${c.reset}`));
    console.log("");
  });

  console.log(`  ${info} Link direto: ${c.cyan}https://developers.facebook.com/apps/${c.reset}\n`);
}

main().catch(e => {
  console.error(`${c.red}[ERRO FATAL]${c.reset}`, e);
  process.exit(1);
});
