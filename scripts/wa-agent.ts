#!/usr/bin/env tsx
/**
 * Agente WhatsApp — comandos /setup e /x
 *
 * Um único processo conecta ao WhatsApp Web (Playwright) e escuta dois comandos:
 *   /setup <pedido> — interpreta e executa ações no projeto via Claude + bash.
 *   /x <ideia>      — opera postagens no X (Twitter) em nome do @rtoi: rascunha
 *                     com Claude e (por padrão) pede aprovação antes de publicar.
 *
 * IMPORTANTE: a sessão do WhatsApp Web é single-active — NÃO rode um segundo
 * processo apontando para o mesmo WA_SESSION_DIR (eles se deslogam). O X usa um
 * Chromium/contexto SEPARADO (X_SESSION_DIR), iniciado sob demanda no 1º /x.
 *
 * Pré-requisitos:
 *   - ANTHROPIC_API_KEY configurada
 *   - Sessão WhatsApp ativa (npm run connect)
 *   - Para /x: sessão do X ativa (npm run x-connect)
 *
 * Uso: npm run agent
 */

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import { PlaywrightClient } from "../src/adapters/playwright/client.js";
import { XClient } from "../src/adapters/x/client.js";
import { guardAdapter } from "../src/guard.js";
import { parseCsv, isAuthorized } from "../src/agent-auth.js";
import { closeDb } from "../src/store/db.js";
import { draftPost, type DraftKind } from "../src/x-draft.js";
import {
  parseXCommand, classifyReply, shouldAutoPost, parseAutoPostMode, isExpired,
  isDraftingCommand, putPendingDraft, getPendingDraft, clearPendingDraft,
  initXSchema, type PendingDraft, type XCommand,
} from "../src/x-approval.js";
import type { WhatsAppAdapter } from "../src/adapters/base.js";
import type { Message } from "../src/types/index.js";

const PROJECT_DIR = process.env.PROJECT_DIR ?? "/home/user/rstoi";
const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";
const CMD_PREFIX = "/setup";
const MAX_REPLY_LEN = 3800;

// Controles de segurança do /setup (RCE) — ver src/agent-auth.ts.
const AGENT_GROUPS = parseCsv(process.env.WA_AGENT_GROUPS);          // grupos onde responde
const ALLOWED_SENDERS = parseCsv(process.env.WA_AGENT_ALLOWED_SENDERS); // quem pode disparar

// Autorização do /x (allowlist própria, mais restrita — posta como @rtoi).
const X_AGENT_GROUPS = parseCsv(process.env.X_AGENT_GROUPS);
const X_ALLOWED_SENDERS = parseCsv(process.env.X_AGENT_ALLOWED_SENDERS);
const X_AUTO_POST = parseAutoPostMode(process.env.X_AUTO_POST);
const X_APPROVAL_TIMEOUT_MS = parseInt(process.env.X_APPROVAL_TIMEOUT_MS ?? "1800000", 10);

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

const X_HELP_TEXT = [
  "🐦 *Agente X (@rtoi) — comandos*",
  "",
  "Use: */x <ideia>* — eu rascunho o post e peço sua aprovação antes de publicar.",
  "",
  "*Comandos:*",
  "• */x <ideia>* → tweet (ou thread, se render)",
  "• */x thread <ideia>* → força uma thread",
  "• */x responder <url> <ideia>* → responde um tweet",
  "• */x citar <url> <ideia>* → quote-post",
  "• */x curtir <url>* → curte",
  "• */x repostar <url>* → reposta (RT)",
  "• */x mentions* → lê suas menções recentes",
  "• */x ajuda* → mostra esta ajuda",
  "",
  "Ao receber um rascunho, responda: *ok* p/ publicar, *editar <texto>* p/ ajustar, *cancelar* p/ descartar.",
  "ℹ️ Restrito aos grupos/remetentes autorizados do /x.",
].join("\n");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Tool execution (/setup) ─────────────────────────────────────────────────

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

// ── Claude agentic loop (/setup) ────────────────────────────────────────────

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

// ── Autorização compartilhada ───────────────────────────────────────────────

async function resolveGroupName(adapter: WhatsAppAdapter, msg: Message): Promise<string> {
  if (msg.isGroup && typeof msg.chatId === "string" && msg.chatId.endsWith("@g.us")) {
    try { return (await adapter.getGroup(msg.chatId))?.name ?? ""; } catch { /* best-effort */ }
  }
  return "";
}

// ── /setup handler ──────────────────────────────────────────────────────────

async function handleSetupCommand(adapter: WhatsAppAdapter, msg: Message): Promise<void> {
  // Autorização (deny por padrão): membros de um grupo escopado (WA_AGENT_GROUPS)
  // ou remetente explicitamente autorizado.
  const groupName = await resolveGroupName(adapter, msg);
  if (!isAuthorized({ chatId: msg.chatId, groupName, fromId: msg.fromId, groups: AGENT_GROUPS, senders: ALLOWED_SENDERS })) {
    console.error(`[agent] /setup negado: ${groupName || msg.chatId} / ${msg.fromId}`);
    return; // silencioso
  }

  const command = msg.text!.slice(CMD_PREFIX.length).trim() || "status do projeto";
  console.error(`[agent] /setup de ${msg.fromId} (${groupName || msg.chatId}): ${command}`);

  if (/^(ajuda|help|\?|comandos)$/i.test(command)) {
    await adapter.sendMessage(msg.chatId, { text: HELP_TEXT }).catch(() => {});
    return;
  }

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
    console.error("[agent] Erro ao processar /setup:", msg2);
    try {
      await adapter.sendMessage(msg.chatId, { text: `❌ Erro: ${msg2.slice(0, 200)}` });
    } catch { /* give up */ }
  }
}

// ── /x handler (agente de postagens no X) ───────────────────────────────────

let xClient: XClient | null = null;

async function getXClient(): Promise<XClient> {
  if (!xClient) xClient = new XClient();
  if (!xClient.isConnected()) await xClient.connect();
  return xClient;
}

function previewDraft(draft: PendingDraft): string {
  const head = draft.kind === "thread"
    ? `🧵 *Rascunho de thread (${draft.tweets.length} tweets)*`
    : draft.kind === "reply" ? "↩️ *Rascunho de resposta*"
    : draft.kind === "quote" ? "🔁 *Rascunho de quote*"
    : "🐦 *Rascunho de tweet*";
  const body = draft.tweets.map((t, i) =>
    draft.tweets.length > 1 ? `*${i + 1}.* ${t}` : t).join("\n\n");
  const target = draft.targetUrl ? `\n_alvo:_ ${draft.targetUrl}` : "";
  return `${head}${target}\n\n${body}\n\n— Responda *ok* p/ publicar, *editar <texto>* ou *cancelar*.`;
}

/** Publica um rascunho no X conforme o tipo. Retorna a URL resultante. */
async function publishDraft(x: XClient, draft: PendingDraft): Promise<string> {
  if (draft.kind === "reply" && draft.targetUrl) {
    let prev = draft.targetUrl;
    let firstUrl = "";
    for (const t of draft.tweets) {
      const r = await x.reply(prev, t);
      if (!firstUrl) firstUrl = r.url;
      prev = r.url || prev;
    }
    return firstUrl;
  }
  if (draft.kind === "quote" && draft.targetUrl) {
    const r = await x.quote(draft.targetUrl, draft.tweets[0]);
    return r.url;
  }
  // tweet ou thread
  const r = await x.postThread(draft.tweets);
  return r.url;
}

async function publishAndConfirm(adapter: WhatsAppAdapter, chatId: string, draft: PendingDraft): Promise<void> {
  const x = await getXClient();
  const url = await publishDraft(x, draft);
  const dry = x.isDryRun() ? " _(DRY-RUN — não publicado de verdade)_" : "";
  await adapter.sendMessage(chatId, { text: `✅ Publicado no X${dry}${url ? `\n${url}` : ""}` }).catch(() => {});
}

const KIND_BY_COMMAND: Record<string, DraftKind> = {
  post: "tweet", thread: "thread", reply: "reply", quote: "quote",
};

async function handleXCommand(adapter: WhatsAppAdapter, msg: Message, cmd: XCommand): Promise<void> {
  const chatId = msg.chatId;

  // Ajuda não exige conexão ao X.
  if (cmd.type === "help") {
    await adapter.sendMessage(chatId, { text: X_HELP_TEXT }).catch(() => {});
    return;
  }

  // Ações sem rascunho: curtir, repostar, ler menções.
  if (cmd.type === "like" || cmd.type === "repost") {
    if (!cmd.targetUrl) {
      await adapter.sendMessage(chatId, { text: "⚠️ Informe a URL do tweet. Ex.: /x curtir https://x.com/.../status/123" }).catch(() => {});
      return;
    }
    try {
      const x = await getXClient();
      if (cmd.type === "like") await x.like(cmd.targetUrl);
      else await x.repost(cmd.targetUrl);
      const dry = x.isDryRun() ? " _(DRY-RUN)_" : "";
      await adapter.sendMessage(chatId, { text: `✅ ${cmd.type === "like" ? "Curtido" : "Repostado"}${dry}: ${cmd.targetUrl}` }).catch(() => {});
    } catch (err) {
      await notifyXError(adapter, chatId, err);
    }
    return;
  }

  if (cmd.type === "mentions") {
    try {
      const x = await getXClient();
      const mentions = await x.getMentions(10);
      const body = mentions.length
        ? mentions.map((m, i) => `*${i + 1}.* ${m.author}: ${m.text.slice(0, 120)}\n${m.url}`).join("\n\n")
        : "Nenhuma menção recente encontrada.";
      await adapter.sendMessage(chatId, { text: `📨 *Menções recentes*\n\n${body}` }).catch(() => {});
    } catch (err) {
      await notifyXError(adapter, chatId, err);
    }
    return;
  }

  // Comandos que geram rascunho: post / thread / reply / quote.
  if (!isDraftingCommand(cmd.type)) return;
  if ((cmd.type === "reply" || cmd.type === "quote") && !cmd.targetUrl) {
    await adapter.sendMessage(chatId, { text: "⚠️ Informe a URL do tweet alvo." }).catch(() => {});
    return;
  }
  if (!cmd.idea.trim()) {
    await adapter.sendMessage(chatId, { text: "⚠️ Diga o que postar. Ex.: /x lançamos o novo agente hoje 🚀" }).catch(() => {});
    return;
  }

  await adapter.sendMessage(chatId, { text: "✍️ Rascunhando…" }).catch(() => {});

  try {
    const draftKind = cmd.type === "post" ? "auto" : KIND_BY_COMMAND[cmd.type];
    const result = await draftPost(cmd.idea, { kind: draftKind });
    const now = Date.now();
    const draft: PendingDraft = {
      chatId,
      requestedBy: msg.fromId,
      idea: cmd.idea,
      tweets: result.tweets,
      kind: cmd.type === "post" ? result.kind : KIND_BY_COMMAND[cmd.type],
      targetUrl: cmd.targetUrl,
      createdAt: now,
      expiresAt: now + X_APPROVAL_TIMEOUT_MS,
      status: "awaiting_approval",
    };

    if (shouldAutoPost(draft.kind, X_AUTO_POST)) {
      await publishAndConfirm(adapter, chatId, draft);
    } else {
      putPendingDraft(draft);
      await adapter.sendMessage(chatId, { text: previewDraft(draft) }).catch(() => {});
    }
  } catch (err) {
    await notifyXError(adapter, chatId, err);
  }
}

/** Trata uma resposta (sem prefixo) quando há rascunho pendente para o chat. */
async function handleApprovalReply(adapter: WhatsAppAdapter, msg: Message, draft: PendingDraft): Promise<void> {
  const chatId = msg.chatId;

  if (isExpired(draft)) {
    clearPendingDraft(chatId);
    await adapter.sendMessage(chatId, { text: "⌛ O rascunho expirou. Mande */x <ideia>* de novo." }).catch(() => {});
    return;
  }

  const { action, editText } = classifyReply(msg.text ?? "");

  if (action === "cancel") {
    clearPendingDraft(chatId);
    await adapter.sendMessage(chatId, { text: "🗑️ Rascunho descartado." }).catch(() => {});
    return;
  }

  if (action === "publish") {
    try {
      await publishAndConfirm(adapter, chatId, draft);
      clearPendingDraft(chatId);
    } catch (err) {
      await notifyXError(adapter, chatId, err);
    }
    return;
  }

  if (action === "edit") {
    await adapter.sendMessage(chatId, { text: "✍️ Ajustando…" }).catch(() => {});
    try {
      const guidance = editText
        ? `${draft.idea}\n\nAjuste pedido: ${editText}`
        : draft.idea;
      const result = await draftPost(guidance, { kind: draft.kind === "tweet" ? "auto" : draft.kind });
      const updated: PendingDraft = {
        ...draft,
        tweets: result.tweets,
        kind: draft.kind === "reply" || draft.kind === "quote" ? draft.kind : result.kind,
        status: "awaiting_approval",
      };
      putPendingDraft(updated);
      await adapter.sendMessage(chatId, { text: previewDraft(updated) }).catch(() => {});
    } catch (err) {
      await notifyXError(adapter, chatId, err);
    }
    return;
  }

  // action === "none": lembra as opções.
  await adapter.sendMessage(chatId, {
    text: "❓ Há um rascunho pendente. Responda *ok*, *editar <texto>* ou *cancelar*.",
  }).catch(() => {});
}

async function notifyXError(adapter: WhatsAppAdapter, chatId: string, err: unknown): Promise<void> {
  const m = err instanceof Error ? err.message : String(err);
  console.error("[agent] Erro no /x:", m);
  await adapter.sendMessage(chatId, { text: `❌ Erro no X: ${m.slice(0, 240)}` }).catch(() => {});
}

// ── Roteamento de mensagens ─────────────────────────────────────────────────

function startsWithX(text: string): boolean {
  return /^\/x(\s|$)/i.test(text);
}

async function routeMessage(adapter: WhatsAppAdapter, msg: Message): Promise<void> {
  const text = msg.text ?? "";

  // /setup → handler existente.
  if (text.startsWith(CMD_PREFIX)) {
    await handleSetupCommand(adapter, msg);
    return;
  }

  // /x → handler do X (autorização própria).
  if (startsWithX(text)) {
    const groupName = await resolveGroupName(adapter, msg);
    if (!isAuthorized({ chatId: msg.chatId, groupName, fromId: msg.fromId, groups: X_AGENT_GROUPS, senders: X_ALLOWED_SENDERS })) {
      console.error(`[agent] /x negado: ${groupName || msg.chatId} / ${msg.fromId}`);
      return; // silencioso
    }
    const body = text.replace(/^\/x\s*/i, "");
    await handleXCommand(adapter, msg, parseXCommand(body));
    return;
  }

  // Resposta a um rascunho pendente (sem prefixo).
  const draft = getPendingDraft(msg.chatId);
  if (draft) {
    const groupName = await resolveGroupName(adapter, msg);
    if (!isAuthorized({ chatId: msg.chatId, groupName, fromId: msg.fromId, groups: X_AGENT_GROUPS, senders: X_ALLOWED_SENDERS })) {
      return; // só autorizados aprovam
    }
    await handleApprovalReply(adapter, msg, draft);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.error("\n╔══════════════════════════════════════════════════╗");
  console.error(  "║  Agente WhatsApp — comandos /setup e /x           ║");
  console.error(  "╚══════════════════════════════════════════════════╝\n");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("✗ ANTHROPIC_API_KEY não configurada. Defina no .env ou exporte antes de rodar.");
    process.exit(1);
  }

  // Prepara as tabelas do agente X (idempotente).
  try { initXSchema(); } catch (e) { console.error("[agent] aviso: initXSchema falhou:", e); }

  // Envolve o cliente no guard: o agente NÃO processa nem responde mensagens de
  // grupos bloqueados (WA_BLOCKED_GROUPS, ex.: financasfacil).
  const adapter = guardAdapter(new PlaywrightClient());
  const startedAt = Date.now();

  adapter.onMessage = (msg: Message) => {
    if (msg.timestamp < startedAt) return;          // skip messages before startup
    if (msg.isFromMe) return;                        // ignore own messages
    if (!msg.text) return;

    // Fire-and-forget; erros são tratados dentro dos handlers.
    routeMessage(adapter, msg).catch(console.error);
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
  console.error(`  /setup <comando>  → ações no projeto`);
  console.error(`  /x <ideia>        → postagens no X (auto-post: ${JSON.stringify(X_AUTO_POST)})\n`);

  process.on("SIGINT", async () => {
    console.error("\n→ Encerrando agente…");
    await adapter.disconnect().catch(() => {});
    await xClient?.disconnect().catch(() => {});
    closeDb();
    process.exit(0);
  });

  // Keep alive indefinitely
  await new Promise<void>(() => {});
}

main().catch(e => { console.error(e); process.exit(1); });
