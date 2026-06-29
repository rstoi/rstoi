#!/usr/bin/env tsx
/**
 * OpenClaw → Agentes do repo (ponte de comandos do WhatsApp)
 *
 * O OpenClaw segura a conexão do WhatsApp e expõe os canais por MCP
 * (`openclaw mcp serve`: events_poll/events_wait para inbound, messages_send
 * para outbound). Esta ponte:
 *   1. conecta no MCP do OpenClaw;
 *   2. recebe mensagens recebidas no WhatsApp;
 *   3. filtra comandos "/setup …" de remetentes/grupos autorizados;
 *   4. interpreta com o agente do repo (Claude + bash) — src/agent/interpret.ts;
 *   5. responde pela mesma conversa, via OpenClaw.
 *
 * Assim, "os comandos vindos do WhatsApp são interpretados pelos agentes do
 * repositório", usando o OpenClaw apenas como transporte.
 *
 * Pré-requisitos:
 *   - Gateway do OpenClaw rodando e WhatsApp pareado (linked).
 *   - O cliente MCP precisa de escopo operator no gateway (aprovar 1x em
 *     `openclaw devices` / no dashboard).
 *   - ANTHROPIC_API_KEY e CLAUDE_MODEL no ambiente (para interpretar).
 *   - WA_AGENT_GROUPS / WA_AGENT_ALLOWED_SENDERS para autorizar (deny por padrão).
 *
 * Uso: npm run bridge
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { parseCsv, isAuthorized } from "../src/agent-auth.js";
import { interpretCommand } from "../src/agent/interpret.js";

const CMD_PREFIX = process.env.WA_CMD_PREFIX ?? "/setup";
const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";
const MAX_REPLY_LEN = 3800;
const WAIT_MS = 60_000;
const VERBOSE = process.env.BRIDGE_VERBOSE === "1";

const AGENT_GROUPS = parseCsv(process.env.WA_AGENT_GROUPS);
const ALLOWED_SENDERS = parseCsv(process.env.WA_AGENT_ALLOWED_SENDERS);

const HELP_TEXT = [
  "🛠️ *Agente Setup (via OpenClaw) — comandos aceitos*",
  "",
  "Use: */setup <pedido>* — eu interpreto e executo no projeto, e respondo o resultado.",
  "",
  "*Exemplos:* */setup status do projeto* · */setup rode os testes* · */setup como está o git*",
  "ℹ️ Funciona apenas para remetentes/grupos autorizados.",
].join("\n");

// ── helpers de extração (shape dos eventos pode variar entre versões) ──────────
function pick<T = unknown>(obj: Record<string, unknown> | undefined, keys: string[]): T | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] != null) return obj[k] as T;
  }
  return undefined;
}

function gatewayToken(): string {
  const p = path.join(os.homedir(), ".openclaw", "openclaw.json");
  try {
    const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
    return cfg?.gateway?.auth?.token ?? "";
  } catch {
    return "";
  }
}

/** Resultado de tool MCP → objeto JS (o texto costuma ser JSON). */
function parseToolResult(res: unknown): unknown {
  const content = (res as { content?: Array<{ type: string; text?: string }> })?.content;
  const text = content?.find((c) => c.type === "text")?.text;
  if (!text) return res;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

interface InboundMsg {
  cursor?: number;
  sessionKey?: string;
  text?: string;
  fromId?: string;
  groupName?: string;
  chatId?: string;
  isFromMe?: boolean;
}

/** Normaliza um evento bruto do OpenClaw para o que a ponte precisa. */
function normalizeEvent(ev: Record<string, unknown>): InboundMsg {
  const msg = (pick<Record<string, unknown>>(ev, ["message", "msg", "payload"]) ?? ev) as Record<string, unknown>;
  return {
    cursor: pick<number>(ev, ["cursor", "seq", "id"]),
    sessionKey: pick<string>(ev, ["session_key", "sessionKey", "session", "conversation", "conversationKey", "key"]) ??
      pick<string>(msg, ["session_key", "sessionKey", "conversation", "chatId"]),
    text: pick<string>(msg, ["text", "body", "content"]),
    fromId: pick<string>(msg, ["fromId", "from", "sender", "author", "senderId"]),
    groupName: pick<string>(msg, ["groupName", "group", "chatName", "title"]),
    chatId: pick<string>(msg, ["chatId", "chat", "conversation"]),
    isFromMe: pick<boolean>(msg, ["isFromMe", "fromMe", "outbound"]) ?? false,
  };
}

async function main() {
  console.error("\n╔══════════════════════════════════════════════════╗");
  console.error(  "║  OpenClaw → Agentes do repo (ponte WhatsApp)      ║");
  console.error(  "╚══════════════════════════════════════════════════╝\n");

  const token = process.env.OPENCLAW_GATEWAY_TOKEN ?? gatewayToken();
  if (!token) {
    console.error("✗ Token do gateway não encontrado (~/.openclaw/openclaw.json). Abortando.");
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("⚠ ANTHROPIC_API_KEY ausente — a ponte recebe/responde, mas não interpreta (responde aviso).");
  }

  const transport = new StdioClientTransport({
    command: "openclaw",
    args: ["mcp", "serve", "--token", token],
    env: { ...process.env } as Record<string, string>,
  });
  const client = new Client({ name: "openclaw-repo-bridge", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  console.error("✓ Conectado ao MCP do OpenClaw. Aguardando comandos no WhatsApp…\n");

  const sendReply = async (sessionKey: string, text: string) => {
    const truncated = text.length > MAX_REPLY_LEN ? text.slice(0, MAX_REPLY_LEN) + "\n\n…(truncado)" : text;
    await client.callTool({ name: "messages_send", arguments: { session_key: sessionKey, text: truncated } })
      .catch((e) => console.error("[bridge] falha ao enviar:", String(e)));
  };

  const handle = async (m: InboundMsg) => {
    if (!m.sessionKey || !m.text || m.isFromMe) return;
    if (!m.text.startsWith(CMD_PREFIX)) return;

    if (!isAuthorized({ chatId: m.chatId, groupName: m.groupName, fromId: m.fromId, groups: AGENT_GROUPS, senders: ALLOWED_SENDERS })) {
      console.error(`[bridge] negado (não autorizado): ${m.groupName || m.chatId || m.sessionKey} / ${m.fromId}`);
      return; // silencioso
    }

    const command = m.text.slice(CMD_PREFIX.length).trim() || "status do projeto";
    console.error(`[bridge] /setup de ${m.fromId} (${m.groupName || m.sessionKey}): ${command}`);

    if (/^(ajuda|help|\?|comandos)$/i.test(command)) {
      await sendReply(m.sessionKey, HELP_TEXT);
      return;
    }

    await sendReply(m.sessionKey, `⏳ Executando: _${command}_`);

    if (!process.env.ANTHROPIC_API_KEY) {
      await sendReply(m.sessionKey, "⚠ Modelo não configurado (defina ANTHROPIC_API_KEY e CLAUDE_MODEL no host).");
      return;
    }
    try {
      const answer = await interpretCommand(command, { model: MODEL });
      await sendReply(m.sessionKey, `✅ ${answer}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[bridge] erro ao interpretar:", msg);
      await sendReply(m.sessionKey, `❌ Erro: ${msg.slice(0, 200)}`);
    }
  };

  // loop de recepção, baseado em cursor
  let cursor = 0;
  for (;;) {
    let res: unknown;
    try {
      res = await client.callTool({ name: "events_wait", arguments: { after_cursor: cursor, timeout_ms: WAIT_MS } });
    } catch (e) {
      console.error("[bridge] events_wait falhou, tentando de novo em 3s:", String(e));
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    const parsed = parseToolResult(res) as Record<string, unknown> | unknown[];
    if (VERBOSE) console.error("[bridge] raw:", JSON.stringify(parsed).slice(0, 600));

    const rawEvents: Record<string, unknown>[] = Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[])
      : ((pick<Record<string, unknown>[]>(parsed as Record<string, unknown>, ["events", "items", "messages"]) ?? []) as Record<string, unknown>[]);

    for (const ev of rawEvents) {
      const m = normalizeEvent(ev);
      if (typeof m.cursor === "number" && m.cursor > cursor) cursor = m.cursor;
      await handle(m).catch((e) => console.error("[bridge] handle erro:", String(e)));
    }
    // avança cursor se o resultado trouxe um cursor agregado
    const topCursor = pick<number>(parsed as Record<string, unknown>, ["cursor", "next_cursor", "nextCursor"]);
    if (typeof topCursor === "number" && topCursor > cursor) cursor = topCursor;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
