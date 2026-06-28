#!/usr/bin/env tsx
/**
 * ctl — Gestão central de serviços, agentes e infraestrutura
 *
 * Uso:
 *   npm run ctl                    → status geral
 *   npm run ctl status             → status geral
 *   npm run ctl list               → lista todos os componentes
 *   npm run ctl start <id>         → inicia serviço/agente
 *   npm run ctl stop  <id>         → para serviço/agente
 *   npm run ctl restart <id>       → reinicia serviço/agente
 *   npm run ctl logs <id> [n]      → últimas n linhas do log
 *   npm run ctl git                → status do repositório
 *   npm run ctl env                → variáveis de ambiente relevantes
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import {
  SERVICES, AGENTS, REPOS, INTERFACES, ALL_SERVICES, findService,
  type ServiceDef,
} from "../src/manage/registry.js";
import { getStatus, start, stop, restart, tailLog, readPid } from "../src/manage/pm.js";

// ── ANSI ─────────────────────────────────────────────────────────────────────

const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  blue:   "\x1b[34m",
  cyan:   "\x1b[36m",
  white:  "\x1b[37m",
  gray:   "\x1b[90m",
};

const dot = {
  ok:   `${c.green}●${c.reset}`,
  err:  `${c.red}●${c.reset}`,
  warn: `${c.yellow}●${c.reset}`,
  off:  `${c.gray}○${c.reset}`,
};

function sh(cmd: string, fallback = ""): string {
  try { return execSync(cmd, { encoding: "utf8", timeout: 5000 }).trim(); }
  catch { return fallback; }
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function statusDot(svc: ServiceDef): string {
  const pid = readPid(svc.id);
  if (pid && isAlive(pid)) return dot.ok;
  return dot.off;
}

function uptime(svc: ServiceDef): string {
  const pid = readPid(svc.id);
  if (!pid || !isAlive(pid)) return c.gray + "stopped" + c.reset;
  const info = getStatus(svc);
  if (info.uptimeSecs == null) return c.green + `PID ${pid}` + c.reset;
  const m = Math.floor(info.uptimeSecs / 60);
  const h = Math.floor(m / 60);
  const t = h > 0 ? `${h}h${m % 60}m` : m > 0 ? `${m}m` : `${info.uptimeSecs}s`;
  return `${c.green}PID ${pid}${c.reset} ${c.gray}(${t})${c.reset}`;
}

function row(label: string, value: string, w = 24): void {
  const pad = " ".repeat(Math.max(0, w - label.length));
  console.log(`  ${c.gray}${label}${pad}${c.reset}${value}`);
}

// ── Commands ──────────────────────────────────────────────────────────────────

function cmdStatus(): void {
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  console.log(`\n${c.bold}${c.blue}▸ Infraestrutura rstoi${c.reset}  ${c.gray}${now}${c.reset}\n`);

  // Serviços
  console.log(`${c.bold}SERVIÇOS${c.reset}`);
  for (const svc of SERVICES) {
    const d = statusDot(svc);
    const u = uptime(svc);
    const port = svc.port ? `  ${c.gray}:${svc.port}${c.reset}` : "";
    console.log(`  ${d} ${c.bold}${svc.name}${c.reset}${port}`);
    console.log(`    ${c.gray}${svc.description}${c.reset}`);
    console.log(`    ${u}\n`);
  }

  // Agentes
  console.log(`${c.bold}AGENTES${c.reset}`);
  for (const a of AGENTS) {
    const d = statusDot(a);
    const u = uptime(a);
    const triggers = a.triggers?.map(t => `${c.cyan}${t}${c.reset}`).join(" ") ?? "";
    console.log(`  ${d} ${c.bold}${a.name}${c.reset}  ${triggers}`);
    console.log(`    ${c.gray}${a.description}${c.reset}`);
    console.log(`    ${u}\n`);
  }

  // Repositórios
  console.log(`${c.bold}REPOSITÓRIOS${c.reset}`);
  for (const repo of REPOS) {
    const branch = sh(`git -C ${repo.local} branch --show-current`, repo.branch);
    const commits = sh(`git -C ${repo.local} log --oneline -3`);
    const dirty = sh(`git -C ${repo.local} status --short`);
    console.log(`  ${dot.ok} ${c.bold}${repo.name}${c.reset}  ${c.cyan}${branch}${c.reset}`);
    if (dirty) console.log(`    ${c.yellow}⚠ uncommitted changes${c.reset}`);
    for (const line of commits.split("\n").slice(0, 3)) {
      const [sha, ...rest] = line.split(" ");
      console.log(`    ${c.blue}${sha}${c.reset} ${c.gray}${rest.join(" ")}${c.reset}`);
    }
    console.log();
  }

  // Interfaces
  console.log(`${c.bold}INTERFACES${c.reset}`);
  for (const iface of INTERFACES) {
    const icon = { cli: "⌨", web: "🌐", app: "📱", whatsapp: "💬" }[iface.kind] ?? "•";
    const url = iface.url ? `  ${c.blue}${iface.url}${c.reset}` : "";
    console.log(`  ${icon} ${c.bold}${iface.name}${c.reset}${url}`);
    console.log(`    ${c.gray}${iface.description}${c.reset}\n`);
  }

  // Sistema
  const mem = sh("free -m | grep Mem").split(/\s+/);
  const memPct = mem[1] ? Math.round(+mem[2] / +mem[1] * 100) : 0;
  const disk = sh("df -m / | tail -1").split(/\s+/);
  const diskPct = disk[1] ? Math.round(+disk[2] / +disk[1] * 100) : 0;
  console.log(`${c.bold}SISTEMA${c.reset}`);
  row("Memória", `${mem[2] ?? "?"}/${mem[1] ?? "?"} MB  ${memPct}%`);
  row("Disco", `${disk[2] ?? "?"}/${disk[1] ?? "?"} MB  ${diskPct}%`);
  row("Node.js", sh("node --version", "?"));
  row("Chromium", existsSync("/opt/pw-browsers") ? "disponível" : "ausente");
  console.log();
}

function cmdList(): void {
  console.log(`\n${c.bold}Componentes disponíveis${c.reset}\n`);
  const all = [
    { label: "Serviços", items: SERVICES },
    { label: "Agentes",  items: AGENTS },
  ];
  for (const group of all) {
    console.log(`${c.bold}${group.label}${c.reset}`);
    for (const s of group.items) {
      console.log(`  ${c.cyan}${s.id.padEnd(20)}${c.reset} ${c.gray}${s.name}${c.reset}`);
    }
    console.log();
  }
  console.log(`${c.bold}Interfaces${c.reset}`);
  for (const i of INTERFACES) {
    console.log(`  ${c.cyan}${i.id.padEnd(20)}${c.reset} ${c.gray}${i.name}${c.reset}`);
  }
  console.log();
}

function cmdStart(id: string): void {
  const svc = findService(id);
  if (!svc) { console.error(`${c.red}Serviço não encontrado: ${id}${c.reset}`); process.exit(1); }
  console.log(`Iniciando ${c.bold}${svc.name}${c.reset}…`);
  const r = start(svc);
  if (r.ok) {
    console.log(`${c.green}✓ Iniciado${c.reset} PID ${r.pid}`);
  } else {
    console.error(`${c.red}✗ ${r.error}${c.reset}`);
    process.exit(1);
  }
}

function cmdStop(id: string): void {
  const svc = findService(id);
  if (!svc) { console.error(`${c.red}Serviço não encontrado: ${id}${c.reset}`); process.exit(1); }
  console.log(`Parando ${c.bold}${svc.name}${c.reset}…`);
  const r = stop(id);
  if (r.ok) {
    console.log(`${c.green}✓ Parado${c.reset}`);
  } else {
    console.error(`${c.red}✗ ${r.error}${c.reset}`);
    process.exit(1);
  }
}

async function cmdRestart(id: string): Promise<void> {
  const svc = findService(id);
  if (!svc) { console.error(`${c.red}Serviço não encontrado: ${id}${c.reset}`); process.exit(1); }
  console.log(`Reiniciando ${c.bold}${svc.name}${c.reset}…`);
  const r = await restart(svc);
  if (r.ok) {
    console.log(`${c.green}✓ Reiniciado${c.reset} PID ${r.pid}`);
  } else {
    console.error(`${c.red}✗ ${r.error}${c.reset}`);
    process.exit(1);
  }
}

function cmdLogs(id: string, n = 50): void {
  const svc = findService(id);
  if (!svc) { console.error(`${c.red}Serviço não encontrado: ${id}${c.reset}`); process.exit(1); }
  console.log(`\n${c.bold}Logs — ${svc.name}${c.reset} (últimas ${n} linhas)\n`);
  console.log(tailLog(id, n));
}

function cmdGit(): void {
  for (const repo of REPOS) {
    console.log(`\n${c.bold}${repo.name}${c.reset}  ${c.cyan}${repo.remote}${c.reset}\n`);
    const branch  = sh(`git -C ${repo.local} branch --show-current`);
    const status  = sh(`git -C ${repo.local} status --short`);
    const log     = sh(`git -C ${repo.local} log --oneline -5`);
    const ahead   = sh(`git -C ${repo.local} rev-list @{u}..HEAD --count 2>/dev/null`, "?");
    const behind  = sh(`git -C ${repo.local} rev-list HEAD..@{u} --count 2>/dev/null`, "?");
    row("Branch", `${c.cyan}${branch}${c.reset}`);
    row("Ahead/Behind", `↑${ahead} ↓${behind}`);
    if (status) {
      console.log(`\n  ${c.yellow}Changes:${c.reset}`);
      for (const l of status.split("\n")) console.log(`    ${l}`);
    }
    console.log(`\n  ${c.bold}Últimos commits:${c.reset}`);
    for (const l of log.split("\n")) {
      const [sha, ...rest] = l.split(" ");
      console.log(`    ${c.blue}${sha}${c.reset} ${rest.join(" ")}`);
    }
    console.log();
  }
}

function cmdEnv(): void {
  const vars = [
    "WA_ADAPTER", "WA_SESSION_DIR", "WA_BLOCKED_GROUPS",
    "WA_AGENT_GROUPS", "WA_AGENT_ALLOWED_SENDERS",
    "ANTHROPIC_API_KEY", "CLAUDE_MODEL",
    "SQLITE_DB_PATH", "MCP_TRANSPORT", "LOG_LEVEL",
    "CLAUDE_CODE_REMOTE", "CLAUDE_PROJECT_DIR",
  ];
  console.log(`\n${c.bold}Variáveis de ambiente relevantes${c.reset}\n`);
  for (const v of vars) {
    const val = process.env[v];
    const display = !val ? `${c.gray}(não definida)${c.reset}`
      : v.includes("KEY") || v.includes("TOKEN") ? `${c.green}*** (definida)${c.reset}`
      : `${c.white}${val}${c.reset}`;
    row(v, display, 32);
  }
  console.log();
}

function cmdHelp(): void {
  console.log(`
${c.bold}ctl${c.reset} — Gestão de serviços e agentes

  ${c.cyan}npm run ctl${c.reset}                    Status geral
  ${c.cyan}npm run ctl list${c.reset}               Lista todos os componentes
  ${c.cyan}npm run ctl start${c.reset} ${c.gray}<id>${c.reset}          Inicia serviço ou agente
  ${c.cyan}npm run ctl stop${c.reset}  ${c.gray}<id>${c.reset}          Para serviço ou agente
  ${c.cyan}npm run ctl restart${c.reset} ${c.gray}<id>${c.reset}        Reinicia serviço ou agente
  ${c.cyan}npm run ctl logs${c.reset}  ${c.gray}<id> [n]${c.reset}      Últimas n linhas do log
  ${c.cyan}npm run ctl git${c.reset}               Status do(s) repositório(s)
  ${c.cyan}npm run ctl env${c.reset}               Variáveis de ambiente

IDs disponíveis:
${ALL_SERVICES.map(s => `  ${c.cyan}${s.id}${c.reset}`).join("\n")}
`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [,, cmd, arg1, arg2] = process.argv;

  switch (cmd ?? "status") {
    case "status":   cmdStatus(); break;
    case "list":     cmdList(); break;
    case "start":    if (!arg1) { console.error("Uso: ctl start <id>"); process.exit(1); } cmdStart(arg1); break;
    case "stop":     if (!arg1) { console.error("Uso: ctl stop <id>");  process.exit(1); } cmdStop(arg1); break;
    case "restart":  if (!arg1) { console.error("Uso: ctl restart <id>"); process.exit(1); } await cmdRestart(arg1); break;
    case "logs":     cmdLogs(arg1 ?? "", arg2 ? parseInt(arg2, 10) : 50); break;
    case "git":      cmdGit(); break;
    case "env":      cmdEnv(); break;
    case "help":
    case "--help":
    case "-h":       cmdHelp(); break;
    default:
      console.error(`${c.red}Comando desconhecido: ${cmd}${c.reset}`);
      cmdHelp();
      process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
