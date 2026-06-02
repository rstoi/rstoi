#!/usr/bin/env tsx
/**
 * Meta WhatsApp Cloud API Simulator
 *
 * Simula os endpoints da Graph API da Meta localmente.
 * Permite desenvolver e testar o MCP sem credenciais reais.
 *
 * Endpoints implementados:
 *   POST /{phoneId}/messages               → envia mensagem (salva no store)
 *   GET  /{phoneId}                        → info do número
 *   GET  /{phoneId}/whatsapp_business_profile
 *   POST /{phoneId}/whatsapp_business_profile
 *   GET  /{bizId}/message_templates        → templates
 *   DELETE /{phoneId}/messages/{msgId}     → deleta mensagem
 *   GET  /health                           → status
 *   GET  /conversations                    → visualizador de mensagens
 */
import express from "express";
import crypto from "crypto";
import { getDb } from "./store/db.js";

const app   = express();
const PORT  = parseInt(process.env.WA_MOCK_PORT ?? "4000", 10);
const PHONE_ID = process.env.WA_PHONE_NUMBER_ID ?? "mock-phone-id";
const BIZ_ID   = process.env.WA_BUSINESS_ACCOUNT_ID ?? "mock-biz-id";
const TOKEN    = process.env.WA_ACCESS_TOKEN ?? "mock-token";

// Contatos simulados (agenda)
const CONTACTS: Record<string, { name: string; jid: string }> = {
  "5511991110001": { name: "Renato Toi", jid: "5511991110001@s.whatsapp.net" },
  "5511991110002": { name: "Alice Silva", jid: "5511991110002@s.whatsapp.net" },
  "5511991110003": { name: "Bob Santos",  jid: "5511991110003@s.whatsapp.net" },
};

const TEMPLATES = [
  { id: "tpl001", name: "hello_world",       language: "en_US", status: "APPROVED", category: "UTILITY",     components: [] },
  { id: "tpl002", name: "boas_vindas",        language: "pt_BR", status: "APPROVED", category: "MARKETING",   components: [] },
  { id: "tpl003", name: "confirmacao_pedido", language: "pt_BR", status: "APPROVED", category: "TRANSACTIONAL", components: [] },
];

// ── Cores ANSI ──────────────────────────────────────────────────────────────
const c = { reset:"\x1b[0m", bold:"\x1b[1m", dim:"\x1b[2m", green:"\x1b[32m", red:"\x1b[31m", yellow:"\x1b[33m", cyan:"\x1b[36m", magenta:"\x1b[35m" };
const log = (method: string, path: string, status: number) =>
  console.log(`  ${c.dim}${new Date().toISOString()}${c.reset}  ${c.bold}${method.padEnd(6)}${c.reset}  ${path.padEnd(50)}  ${status < 400 ? c.green : c.red}${status}${c.reset}`);

app.use(express.json());

// ── Auth middleware ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  // Skip health and visual endpoints
  if (req.path === "/health" || req.path === "/conversations" || req.path === "/simulate-inbound") return next();
  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Bearer ") || auth.slice(7) !== TOKEN) {
    log(req.method, req.path, 401);
    return res.status(401).json({ error: { message: "Invalid token", type: "OAuthException", code: 190 } });
  }
  next();
});

// ── GET /health ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  const db = getDb();
  const msgs = (db.prepare("SELECT COUNT(*) as n FROM messages").get() as { n: number }).n;
  res.json({ status: "ok", mock: true, phone_id: PHONE_ID, messages_stored: msgs });
});

// ── GET /conversations  (visualizador) ─────────────────────────────────────
app.get("/conversations", (_req, res) => {
  const db = getDb();
  const msgs = db.prepare("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50").all() as Record<string, unknown>[];

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="3">
  <title>WhatsApp MCP — Conversas</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0a1628; color: #e2e8f0; margin: 0; padding: 20px; }
    h1   { color: #25d366; font-size: 1.4rem; margin-bottom: 4px; }
    small { color: #64748b; }
    .badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600; }
    .from-me { background:#25d366; color:#000; }
    .from-them { background:#1e3a5f; color:#93c5fd; }
    .msg { background:#1e293b; border-radius:8px; padding:12px 16px; margin:8px 0; border-left:3px solid #25d366; }
    .msg.them { border-left-color:#3b82f6; }
    .meta { font-size:11px; color:#64748b; margin-bottom:4px; }
    .text { font-size:14px; }
    .empty { color:#64748b; text-align:center; padding:40px; }
    .refresh { color:#64748b; font-size:11px; }
  </style>
</head>
<body>
  <h1>📱 WhatsApp Business MCP — Conversas</h1>
  <small>${msgs.length} mensagem(ns) • <span class="refresh">atualiza a cada 3s</span></small>
  <hr style="border-color:#1e3a5f; margin:16px 0">
  ${msgs.length === 0
    ? '<div class="empty">Nenhuma mensagem ainda.<br>Use o MCP para enviar mensagens.</div>'
    : msgs.map(m => {
        const fromMe = Boolean(m["is_from_me"]);
        const name = m["from_name"] ?? (fromMe ? "Você" : m["from_id"]);
        const dt = new Date(m["timestamp"] as number).toLocaleString("pt-BR");
        const isGroup = Boolean(m["is_group"]);
        return `<div class="msg ${fromMe ? "" : "them"}">
          <div class="meta">
            <span class="badge ${fromMe ? "from-me" : "from-them"}">${fromMe ? "VOCÊ" : name}</span>
            &nbsp; ${c.dim}→${c.reset} <strong>${m["chat_id"]}</strong>
            ${isGroup ? '&nbsp; <span class="badge" style="background:#7c3aed;color:#fff">GRUPO</span>' : ""}
            &nbsp; <span style="color:#64748b">${dt}</span>
            &nbsp; <span style="color:#64748b;font-size:10px">${m["status"] ?? ""}</span>
          </div>
          <div class="text">${String(m["text"] ?? `[${m["type"]}]`).replace(/</g, "&lt;")}</div>
        </div>`;
      }).join("")
  }
</body>
</html>`;
  res.send(html);
});

// ── GET /{phoneId}  — info do número ───────────────────────────────────────
app.get(`/${PHONE_ID}`, (req, res) => {
  log(req.method, req.path, 200);
  res.json({
    id: PHONE_ID,
    display_phone_number: "+55 11 90000-0000",
    verified_name: "WhatsApp MCP Business",
    quality_rating: "GREEN",
    platform_type: "CLOUD_API",
  });
});

// ── GET /{phoneId}/whatsapp_business_profile ───────────────────────────────
app.get(`/${PHONE_ID}/whatsapp_business_profile`, (req, res) => {
  log(req.method, req.path, 200);
  res.json({ data: [{ about: "Atendimento 24h ⚡", address: "São Paulo, Brasil", email: "contato@empresa.com", websites: ["https://empresa.com.br"], vertical: "PROFESSIONAL_SERVICES" }] });
});

app.post(`/${PHONE_ID}/whatsapp_business_profile`, (req, res) => {
  log(req.method, req.path, 200);
  res.json({ success: true });
});

// ── GET /{bizId}/message_templates ─────────────────────────────────────────
app.get(`/${BIZ_ID}/message_templates`, (req, res) => {
  log(req.method, req.path, 200);
  res.json({ data: TEMPLATES, paging: { cursors: { before: "", after: "" } } });
});

// ── POST /{phoneId}/messages — envia mensagem ──────────────────────────────
app.post(`/${PHONE_ID}/messages`, (req, res) => {
  const body = req.body as Record<string, unknown>;
  const to   = body["to"] as string;
  const type = body["type"] as string;

  if (!to) {
    log(req.method, req.path, 400);
    return res.status(400).json({ error: { message: "to is required", type: "GraphMethodException", code: 100 } });
  }

  const msgId = `wamid.${crypto.randomUUID().replace(/-/g, "").toUpperCase()}`;
  const ts    = Date.now();

  // Normalise recipient
  const toClean = to.replace(/\D/g, "");
  const toJid   = toClean.endsWith("@s.whatsapp.net") || toClean.endsWith("@g.us")
    ? to : `${toClean}@s.whatsapp.net`;

  // Extract text / caption
  let text: string | undefined;
  if (type === "text")     text = (body["text"] as { body?: string })?.body;
  if (type === "reaction") text = `[reaction: ${(body["reaction"] as { emoji?: string })?.emoji ?? ""}]`;
  if (type === "template") text = `[template: ${(body["template"] as { name?: string })?.name ?? ""}]`;
  if (["image","video","document","audio"].includes(type)) {
    const media = body[type] as { caption?: string } | undefined;
    text = `[${type}] ${media?.caption ?? ""}`.trim();
  }

  // Recipient name from contacts table
  const db = getDb();
  const contact = db.prepare("SELECT name FROM contacts WHERE id = ? OR phone = ?").get(toJid, toClean) as { name?: string } | undefined;
  const fromName = contact?.name ?? CONTACTS[toClean]?.name ?? "Você";

  db.prepare(`
    INSERT OR REPLACE INTO messages
      (id, chat_id, from_id, from_name, type, text, timestamp, is_group, is_from_me, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'sent')
  `).run(msgId, toJid, PHONE_ID, "Você", type, text ?? null, ts, toJid.endsWith("@g.us") ? 1 : 0);

  // Upsert contact
  const contactName = CONTACTS[toClean]?.name ?? toClean;
  db.prepare("INSERT OR IGNORE INTO contacts (id, name, phone) VALUES (?, ?, ?)").run(toJid, contactName, toClean);

  log(req.method, req.path, 200);
  console.log(`  ${c.green}→${c.reset} Para: ${c.bold}${contactName}${c.reset} (${toClean})  Tipo: ${type}  Texto: ${c.cyan}${(text ?? "").slice(0, 60)}${c.reset}`);

  res.json({
    messaging_product: "whatsapp",
    contacts: [{ input: to, wa_id: toClean }],
    messages: [{ id: msgId, message_status: "accepted" }],
  });
});

// ── DELETE /{phoneId}/messages/{msgId} — deleta mensagem ──────────────────
app.delete(`/${PHONE_ID}/messages/:msgId`, (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM messages WHERE id = ?").run(req.params["msgId"]);
  log(req.method, req.path, 200);
  res.json({ success: true });
});

// ── Simula recebimento de mensagem inbound ─────────────────────────────────
// POST /simulate-inbound  { from, name, text }
app.post("/simulate-inbound", (req, res) => {
  const { from, name, text } = req.body as { from: string; name?: string; text: string };
  const db = getDb();
  const msgId = `wamid.INBOUND${crypto.randomUUID().replace(/-/g, "").toUpperCase()}`;
  const toClean = (from ?? "").replace(/\D/g, "");
  const fromJid = `${toClean}@s.whatsapp.net`;
  const ts = Date.now();

  db.prepare(`
    INSERT OR REPLACE INTO messages
      (id, chat_id, from_id, from_name, type, text, timestamp, is_group, is_from_me, status)
    VALUES (?, ?, ?, ?, 'text', ?, ?, 0, 0, 'delivered')
  `).run(msgId, fromJid, fromJid, name ?? toClean, text, ts);

  db.prepare("INSERT OR IGNORE INTO contacts (id, name, phone) VALUES (?, ?, ?)").run(fromJid, name ?? toClean, toClean);

  log("POST", "/simulate-inbound", 200);
  console.log(`  ${c.magenta}←${c.reset} Inbound de: ${c.bold}${name ?? toClean}${c.reset}  Texto: ${c.cyan}${text.slice(0, 60)}${c.reset}`);
  res.json({ ok: true, id: msgId });
});

// ── Start ───────────────────────────────────────────────────────────────────
getDb();

app.listen(PORT, () => {
  console.log(`\n${c.bold}${c.green}  Meta Cloud API Simulator rodando em :${PORT}${c.reset}`);
  console.log(`  ${c.cyan}Endpoints:${c.reset}`);
  console.log(`    POST /${PHONE_ID}/messages          → envia mensagem`);
  console.log(`    GET  /${PHONE_ID}                   → info do número`);
  console.log(`    GET  /${BIZ_ID}/message_templates   → templates`);
  console.log(`    POST /simulate-inbound              → simula msg recebida`);
  console.log(`    GET  /health                        → status`);
  console.log(`    GET  /conversations                 → visualizador HTML`);
  console.log(`\n  ${c.yellow}Token:${c.reset}    ${TOKEN}`);
  console.log(`  ${c.yellow}Phone ID:${c.reset} ${PHONE_ID}\n`);
});
