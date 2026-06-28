#!/usr/bin/env node
/**
 * Status + Management Server
 *
 * GET  /                          → dashboard HTML
 * GET  /api/status                → métricas do sistema
 * GET  /api/components            → serviços, agentes, repos, interfaces
 * GET  /api/netcheck              → checagem de rede (30s cache)
 * GET  /api/services/:id/logs     → tail do log
 * POST /api/services/:id/start    → inicia serviço
 * POST /api/services/:id/stop     → para serviço
 * POST /api/services/:id/restart  → reinicia serviço
 * POST /api/exec                  → executa comando (one-shot)
 * POST /api/exec/stream           → executa comando (SSE streaming)
 */

import express from "express";
import { execSync, exec, spawn } from "child_process";
import {
  statSync, existsSync, readFileSync, writeFileSync,
  mkdirSync, appendFileSync, unlinkSync,
} from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import os from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT    = process.env.STATUS_PORT ?? 4099;
const PROJECT = __dirname;
const TSX     = join(PROJECT, "node_modules/.bin/tsx");
const NODE    = process.execPath;
const PATH_ENV = "/opt/node22/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const PIDS_DIR = join(PROJECT, "data/pids");
const LOGS_DIR = join(PROJECT, "data/logs");

mkdirSync(PIDS_DIR, { recursive: true });
mkdirSync(LOGS_DIR, { recursive: true });

const app = express();
app.use(express.json());

// ── helpers ───────────────────────────────────────────────────────────────────

function sh(cmd, fallback = "") {
  try { return execSync(cmd, { encoding: "utf8", timeout: 5000 }).trim(); }
  catch { return fallback; }
}

function pidFile(id)  { return join(PIDS_DIR, `${id}.pid`); }
function logFile(id)  { return join(LOGS_DIR, `${id}.log`); }

function readPid(id) {
  const f = pidFile(id);
  if (!existsSync(f)) return null;
  try { return parseInt(readFileSync(f, "utf8").trim(), 10) || null; }
  catch { return null; }
}

function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function svcStatus(id) {
  const pid = readPid(id);
  return isAlive(pid) ? { status: "running", pid } : { status: "stopped", pid: null };
}

// ── Service registry (inline JS) ──────────────────────────────────────────────

const WA_ENV = {
  PATH: PATH_ENV, HOME: "/root",
  WA_ADAPTER: "baileys",
  WA_SESSION_DIR: join(PROJECT, "data/wa-session"),
  WA_QR_PATH: join(PROJECT, "data/qr.png"),
  WA_BLOCKED_GROUPS: process.env.WA_BLOCKED_GROUPS ?? "financasfacil",
  SQLITE_DB_PATH: join(PROJECT, "data/whatsapp-personal.db"),
  MCP_TRANSPORT: "stdio",
  LOG_LEVEL: "info",
};

const SERVICES = [
  {
    id: "whatsapp-mcp",
    name: "WhatsApp MCP",
    type: "mcp-server",
    description: "MCP de WhatsApp via Baileys (protocolo nativo)",
    cmd: TSX, args: ["src/index.ts"], cwd: PROJECT,
    env: WA_ENV,
  },
  {
    id: "computer-use",
    name: "Computer-use MCP",
    type: "mcp-server",
    description: "MCP de automação de desktop (screenshot, click, type)",
    cmd: TSX, args: ["src/computer-use/server.ts"], cwd: PROJECT,
    env: { PATH: PATH_ENV, HOME: "/root", DISPLAY: ":99" },
  },
  {
    id: "status-server",
    name: "Status Dashboard",
    type: "web-server",
    description: "Este painel (porta 4099)",
    cmd: NODE, args: ["status-server.js"], cwd: PROJECT,
    port: 4099,
    env: { PATH: PATH_ENV, HOME: "/root" },
  },
];

const AGENTS = [
  {
    id: "agent-setup",
    name: "Agente /setup",
    type: "agent",
    description: "Interpreta /setup no WhatsApp via Claude + bash",
    cmd: TSX, args: ["scripts/wa-agent.ts"], cwd: PROJECT,
    triggers: ["/setup"],
    env: {
      ...WA_ENV,
      CLAUDE_MODEL: "claude-opus-4-8",
      WA_AGENT_GROUPS: process.env.WA_AGENT_GROUPS ?? "",
      WA_AGENT_ALLOWED_SENDERS: process.env.WA_AGENT_ALLOWED_SENDERS ?? "",
    },
  },
];

const ALL_SVCS = [...SERVICES, ...AGENTS];

const REPOS = [
  {
    id: "rstoi",
    name: "rstoi/rstoi",
    remote: "https://github.com/rstoi/rstoi",
    branch: sh("git -C " + PROJECT + " branch --show-current", "main"),
    local: PROJECT,
  },
];

const INTERFACES = [
  { id: "cli",              name: "CLI (npm run ctl)", kind: "cli",       description: "Gestão via terminal" },
  { id: "web-dashboard",   name: "Web Dashboard",     kind: "web",       description: "Este painel", url: `http://localhost:${PORT}` },
  { id: "whatsapp",        name: "WhatsApp Pessoal",  kind: "whatsapp",  description: "Canal do assistente (Baileys)" },
  { id: "claude-code-web", name: "Claude Code Web",   kind: "app",       description: "Sessão de dev na web", url: "https://claude.ai/code" },
];

// ── Process management ────────────────────────────────────────────────────────

function startService(svc) {
  const existing = readPid(svc.id);
  if (isAlive(existing)) return { ok: false, error: `Já rodando (PID ${existing})` };

  const env = { ...process.env, ...(svc.env ?? {}) };
  let child;
  try {
    child = spawn(svc.cmd, svc.args, {
      cwd: svc.cwd, env, detached: true,
      stdio: "ignore",
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }

  child.unref();
  const pid = child.pid;
  writeFileSync(pidFile(svc.id), String(pid), "utf8");
  try { appendFileSync(logFile(svc.id), `[pm] started PID ${pid} — ${new Date().toISOString()}\n`); } catch {}
  return { ok: true, pid };
}

function stopService(id, signal = "SIGTERM") {
  const pid = readPid(id);
  if (!isAlive(pid)) return { ok: false, error: "Não está rodando" };
  try {
    process.kill(pid, signal);
    try { appendFileSync(logFile(id), `[pm] stopped (${signal}) — ${new Date().toISOString()}\n`); } catch {}
    setTimeout(() => { try { unlinkSync(pidFile(id)); } catch {} }, 2500);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function restartService(svc) {
  stopService(svc.id);
  await new Promise(r => setTimeout(r, 1500));
  return startService(svc);
}

// ── GET /api/components ───────────────────────────────────────────────────────

app.get("/api/components", (_req, res) => {
  const services = ALL_SVCS.map(s => ({
    ...s,
    env: undefined, // não expor env com segredos
    ...svcStatus(s.id),
    logFile: logFile(s.id),
  }));

  const repos = REPOS.map(r => ({
    ...r,
    branch:     sh(`git -C ${r.local} branch --show-current`, r.branch),
    clean:      sh(`git -C ${r.local} status --short`) === "",
    lastCommit: sh(`git -C ${r.local} log -1 --format=%s`),
    lastTime:   sh(`git -C ${r.local} log -1 --format=%cr`),
    ahead:      parseInt(sh(`git -C ${r.local} rev-list @{u}..HEAD --count 2>/dev/null`, "0"), 10),
    log:        sh(`git -C ${r.local} log --oneline -5`).split("\n")
                  .map(l => ({ sha: l.slice(0, 7), msg: l.slice(8) })),
  }));

  res.json({ services, repos, interfaces: INTERFACES });
});

// ── GET /api/services/:id/logs ────────────────────────────────────────────────

app.get("/api/services/:id/logs", (req, res) => {
  const svc = ALL_SVCS.find(s => s.id === req.params.id);
  if (!svc) return res.status(404).json({ error: "not found" });
  const n = parseInt(req.query.lines ?? "80", 10);
  const lf = logFile(svc.id);
  if (!existsSync(lf)) return res.json({ lines: [] });
  const content = sh(`tail -n ${n} ${lf}`);
  res.json({ id: svc.id, lines: content.split("\n") });
});

// ── POST /api/services/:id/start|stop|restart ─────────────────────────────────

app.post("/api/services/:id/start", async (req, res) => {
  const svc = ALL_SVCS.find(s => s.id === req.params.id);
  if (!svc) return res.status(404).json({ error: "not found" });
  const r = startService(svc);
  res.json(r);
});

app.post("/api/services/:id/stop", (req, res) => {
  const svc = ALL_SVCS.find(s => s.id === req.params.id);
  if (!svc) return res.status(404).json({ error: "not found" });
  res.json(stopService(svc.id));
});

app.post("/api/services/:id/restart", async (req, res) => {
  const svc = ALL_SVCS.find(s => s.id === req.params.id);
  if (!svc) return res.status(404).json({ error: "not found" });
  res.json(await restartService(svc));
});

// ── GET /api/status ───────────────────────────────────────────────────────────

app.get("/api/status", (_req, res) => {
  const memRaw   = sh("free -m | grep Mem").split(/\s+/);
  const memTotal = parseInt(memRaw[1] || "0", 10);
  const memUsed  = parseInt(memRaw[2] || "0", 10);
  const diskRaw  = sh("df -m / | tail -1").split(/\s+/);
  const diskTotal = parseInt(diskRaw[1] || "0", 10);
  const diskUsed  = parseInt(diskRaw[2] || "0", 10);

  let dbStats = { messages: 0, contacts: 0, size: 0 };
  const dbPath = join(PROJECT, "data/whatsapp-personal.db");
  if (existsSync(dbPath)) {
    dbStats.messages = parseInt(sh(`sqlite3 ${dbPath} 'SELECT COUNT(*) FROM messages;'`, "0"), 10);
    dbStats.contacts = parseInt(sh(`sqlite3 ${dbPath} 'SELECT COUNT(*) FROM contacts;'`, "0"), 10);
    try { dbStats.size = Math.round(statSync(dbPath).size / 1024); } catch {}
  }

  res.json({
    ts: new Date().toISOString(),
    system: {
      platform: sh("grep PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '\"'"),
      kernel: os.release(), cpus: os.cpus().length,
      uptime: Math.floor(os.uptime()),
      loadavg: os.loadavg().map(l => l.toFixed(2)),
      hostname: os.hostname(),
    },
    memory: { totalMb: memTotal, usedMb: memUsed, pct: memTotal > 0 ? Math.round(memUsed / memTotal * 100) : 0 },
    disk:   { totalMb: diskTotal, usedMb: diskUsed, pct: diskTotal > 0 ? Math.round(diskUsed / diskTotal * 100) : 0 },
    runtimes: {
      node: process.version,
      npm:  sh("npm --version"),
      tsx:  sh(`${TSX} --version 2>/dev/null | head -1`),
      python: sh("python3 --version 2>&1 | awk '{print $2}'"),
      git:  sh("git --version | awk '{print $3}'"),
      chromium: existsSync("/opt/pw-browsers") ? sh("ls /opt/pw-browsers | tail -1") : null,
    },
    git: {
      branch:    sh(`git -C ${PROJECT} branch --show-current`),
      clean:     sh(`git -C ${PROJECT} status --short`) === "",
      lastCommit: sh(`git -C ${PROJECT} log -1 --format=%s`),
      lastTime:  sh(`git -C ${PROJECT} log -1 --format=%cr`),
      log: sh(`git -C ${PROJECT} log --oneline -5`).split("\n")
             .map(l => ({ sha: l.slice(0, 7), msg: l.slice(8) })),
    },
    db: dbStats,
    waAdapter: "baileys",
  });
});

// ── GET /api/netcheck (30s cache) ─────────────────────────────────────────────

const netCache = { ts: 0, data: null };
app.get("/api/netcheck", async (_req, res) => {
  if (Date.now() - netCache.ts < 30000 && netCache.data) return res.json(netCache.data);
  const hosts = ["github.com", "api.anthropic.com", "web.whatsapp.com", "graph.facebook.com"];
  const results = await Promise.all(hosts.map(host =>
    new Promise(resolve => {
      exec(`curl -s -o /dev/null -w "%{http_code}" --max-time 4 "https://${host}"`, { timeout: 6000 },
        (_err, stdout) => resolve({ host, code: parseInt(stdout || "0", 10) }));
    })
  ));
  netCache.data = results;
  netCache.ts = Date.now();
  res.json(results);
});

// ── POST /api/exec ────────────────────────────────────────────────────────────

app.post("/api/exec", (req, res) => {
  const { cmd } = req.body || {};
  if (!cmd || typeof cmd !== "string" || cmd.length > 2000) return res.status(400).json({ error: "invalid" });
  exec(cmd, { timeout: 30000, cwd: PROJECT, env: { ...process.env, DISPLAY: ":99" } },
    (err, stdout, stderr) => res.json({ cmd, stdout, stderr, exitCode: err ? (err.code ?? 1) : 0 }));
});

app.post("/api/exec/stream", (req, res) => {
  const { cmd } = req.body || {};
  if (!cmd || typeof cmd !== "string" || cmd.length > 2000) return res.status(400).json({ error: "invalid" });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const child = spawn("bash", ["-c", cmd], { cwd: PROJECT, env: { ...process.env, DISPLAY: ":99" } });
  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  child.stdout.on("data", d => send("stdout", d.toString()));
  child.stderr.on("data", d => send("stderr", d.toString()));
  child.on("close", code => { send("exit", code); res.end(); });
  child.on("error", err => { send("error", err.message); res.end(); });
  req.on("close", () => child.kill());
});

// ── GET /qr ── live QR code page ──────────────────────────────────────────────

app.get("/qr", (_req, res) => {
  const qrPath = join(PROJECT, "data/qr.png");
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>WhatsApp QR</title>
<meta http-equiv="refresh" content="5">
<style>body{background:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;color:#eee}
img{width:280px;height:280px;image-rendering:pixelated;border:8px solid white;border-radius:12px}
p{margin-top:16px;font-size:14px;color:#aaa}</style></head>
<body><img src="/qr.png?t=${Date.now()}" alt="QR Code"><p>Escaneie com WhatsApp → Aparelhos conectados → Conectar aparelho<br>Esta página atualiza a cada 5s</p></body></html>`);
});

app.get("/qr.png", (_req, res) => {
  const qrPath = join(PROJECT, "data/qr.png");
  if (!existsSync(qrPath)) return res.status(404).send("QR not ready");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(qrPath);
});

// ── GET / ─────────────────────────────────────────────────────────────────────

app.get("/", (_req, res) => res.sendFile(join(__dirname, "status-dashboard.html")));

app.listen(PORT, () => console.error(`[status-server] http://localhost:${PORT}`));
