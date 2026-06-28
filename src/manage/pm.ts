/**
 * Process Manager — start, stop, restart e status de serviços.
 *
 * Usa PID files em data/pids/<id>.pid e logs em data/logs/<id>.log.
 * Não depende de PM2 ou systemd — funciona no container efêmero da web.
 */

import {
  spawn, execSync,
  type ChildProcess,
} from "child_process";
import {
  writeFileSync, readFileSync, existsSync,
  mkdirSync, statSync,
} from "fs";
import { resolve } from "path";
import type { ServiceDef, ComponentStatus } from "./registry.js";

const PROJECT = process.env.CLAUDE_PROJECT_DIR ?? "/home/user/rstoi";
const PIDS_DIR = resolve(PROJECT, "data/pids");
const LOGS_DIR = resolve(PROJECT, "data/logs");

mkdirSync(PIDS_DIR, { recursive: true });
mkdirSync(LOGS_DIR, { recursive: true });

// ── PID file helpers ──────────────────────────────────────────────────────

function pidFile(id: string): string {
  return resolve(PIDS_DIR, `${id}.pid`);
}

function logFile(id: string): string {
  return resolve(LOGS_DIR, `${id}.log`);
}

export function readPid(id: string): number | null {
  const f = pidFile(id);
  if (!existsSync(f)) return null;
  try {
    return parseInt(readFileSync(f, "utf8").trim(), 10) || null;
  } catch {
    return null;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ── Status ────────────────────────────────────────────────────────────────

export interface ServiceInfo {
  id: string;
  name: string;
  type: string;
  description: string;
  status: ComponentStatus;
  pid: number | null;
  logFile: string;
  logTail: string;
  uptimeSecs?: number;
}

export function getStatus(svc: ServiceDef): ServiceInfo {
  const pid = readPid(svc.id);
  const alive = pid != null && isAlive(pid);
  const lf = logFile(svc.id);
  let logTail = "";
  let uptimeSecs: number | undefined;

  if (existsSync(lf)) {
    try {
      const content = readFileSync(lf, "utf8");
      const lines = content.trim().split("\n");
      logTail = lines.slice(-20).join("\n");
    } catch { /* ignore */ }
    try {
      uptimeSecs = alive ? Math.floor((Date.now() - statSync(lf).mtimeMs) / 1000) : undefined;
    } catch { /* ignore */ }
  }

  return {
    id: svc.id,
    name: svc.name,
    type: svc.type,
    description: svc.description,
    status: alive ? "running" : "stopped",
    pid: alive ? pid : null,
    logFile: lf,
    logTail,
    uptimeSecs,
  };
}

// ── Start ─────────────────────────────────────────────────────────────────

export function start(svc: ServiceDef): { ok: boolean; pid?: number; error?: string } {
  const existing = readPid(svc.id);
  if (existing != null && isAlive(existing)) {
    return { ok: false, error: `${svc.name} já está rodando (PID ${existing})` };
  }

  const lf = logFile(svc.id);
  const { createWriteStream } = await_import_sync();
  const out = createWriteStream(lf, { flags: "a" });

  const env = { ...process.env, ...(svc.env ?? {}) };

  let child: ChildProcess;
  try {
    child = spawn(svc.cmd, svc.args, {
      cwd: svc.cwd,
      env,
      detached: true,
      stdio: ["ignore", out as never, out as never],
    });
  } catch (e: unknown) {
    return { ok: false, error: `Falha ao iniciar: ${e instanceof Error ? e.message : e}` };
  }

  child.unref();
  const pid = child.pid!;
  writeFileSync(pidFile(svc.id), String(pid), "utf8");
  appendLog(svc.id, `[pm] started PID ${pid} — ${new Date().toISOString()}`);
  return { ok: true, pid };
}

// ── Stop ──────────────────────────────────────────────────────────────────

export function stop(id: string, signal: NodeJS.Signals = "SIGTERM"): { ok: boolean; error?: string } {
  const pid = readPid(id);
  if (pid == null || !isAlive(pid)) {
    return { ok: false, error: `Serviço ${id} não está rodando` };
  }
  try {
    process.kill(pid, signal);
    appendLog(id, `[pm] stopped (${signal}) — ${new Date().toISOString()}`);
    // Remove PID file after a brief grace period
    setTimeout(() => {
      try { require("fs").unlinkSync(pidFile(id)); } catch { /* ignore */ }
    }, 2000);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Restart ───────────────────────────────────────────────────────────────

export async function restart(svc: ServiceDef): Promise<{ ok: boolean; pid?: number; error?: string }> {
  const s = stop(svc.id);
  if (!s.ok && s.error && !s.error.includes("não está rodando")) {
    return s;
  }
  await sleep(1500);
  return start(svc);
}

// ── Logs (tail) ───────────────────────────────────────────────────────────

export function tailLog(id: string, lines = 50): string {
  const lf = logFile(id);
  if (!existsSync(lf)) return "(sem logs)";
  try {
    return execSync(`tail -n ${lines} ${lf}`, { encoding: "utf8" });
  } catch {
    return "(erro ao ler log)";
  }
}

export function appendLog(id: string, line: string): void {
  try {
    const { appendFileSync } = require("fs");
    appendFileSync(logFile(id), line + "\n", "utf8");
  } catch { /* ignore */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function await_import_sync() {
  return require("fs");
}
