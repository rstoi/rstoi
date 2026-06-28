import { spawn, type StdioOptions } from "child_process";
import {
  writeFileSync, readFileSync, existsSync,
  mkdirSync, appendFileSync, unlinkSync, openSync,
} from "fs";
import { execSync } from "child_process";
import { resolve } from "path";
import type { ServiceDef } from "./registry.js";

const PROJECT = process.env.CLAUDE_PROJECT_DIR ?? "/home/user/rstoi";
export const PIDS_DIR = resolve(PROJECT, "data/pids");
export const LOGS_DIR = resolve(PROJECT, "data/logs");

mkdirSync(PIDS_DIR, { recursive: true });
mkdirSync(LOGS_DIR, { recursive: true });

export function pidFile(id: string) { return resolve(PIDS_DIR, `${id}.pid`); }
export function logFile(id: string) { return resolve(LOGS_DIR, `${id}.log`); }

export function readPid(id: string): number | null {
  const f = pidFile(id);
  if (!existsSync(f)) return null;
  try { return parseInt(readFileSync(f, "utf8").trim(), 10) || null; }
  catch { return null; }
}

export function isAlive(pid: number | null): boolean {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function log(id: string, line: string) {
  try { appendFileSync(logFile(id), `${line}\n`, "utf8"); } catch { /* ignore */ }
}

export function start(svc: ServiceDef): { ok: boolean; pid?: number; error?: string } {
  const pid = readPid(svc.id);
  if (isAlive(pid)) return { ok: false, error: `Já rodando (PID ${pid})` };

  const env = { ...process.env, ...(svc.env ?? {}) } as NodeJS.ProcessEnv;

  const lf = logFile(svc.id);
  let fd: number;
  try { fd = openSync(lf, "a"); } catch { fd = -1; }
  const out = fd >= 0 ? fd : "ignore";

  let child;
  try {
    child = spawn(svc.cmd, svc.args, {
      cwd: svc.cwd,
      env,
      detached: true,
      stdio: ["ignore", out, out] as StdioOptions,
    });
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  child.unref();
  const newPid = child.pid!;
  writeFileSync(pidFile(svc.id), String(newPid), "utf8");
  log(svc.id, `[pm] started PID ${newPid} — ${new Date().toISOString()}`);
  return { ok: true, pid: newPid };
}

export function stop(id: string, signal: NodeJS.Signals = "SIGTERM"): { ok: boolean; error?: string } {
  const pid = readPid(id);
  if (!isAlive(pid)) return { ok: false, error: "Não está rodando" };
  try {
    process.kill(pid!, signal);
    log(id, `[pm] stopped (${signal}) — ${new Date().toISOString()}`);
    setTimeout(() => { try { unlinkSync(pidFile(id)); } catch { /* ignore */ } }, 2500);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function restart(svc: ServiceDef): Promise<{ ok: boolean; pid?: number; error?: string }> {
  stop(svc.id);
  await new Promise(r => setTimeout(r, 1500));
  return start(svc);
}

export function tailLog(id: string, lines = 50): string {
  const lf = logFile(id);
  if (!existsSync(lf)) return "(sem logs)";
  try { return execSync(`tail -n ${lines} ${lf}`, { encoding: "utf8" }); }
  catch { return "(erro ao ler log)"; }
}

export function getStatus(svc: ServiceDef) {
  const pid = readPid(svc.id);
  const alive = isAlive(pid);
  return { status: alive ? "running" : "stopped" as "running" | "stopped", pid: alive ? pid : null };
}
