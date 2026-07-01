import { execSync } from "child_process";
import { existsSync, statSync } from "fs";
import { join } from "path";
import { config } from "../config.js";

export interface Situacao {
  ts: string;
  git: {
    branch: string;
    clean: boolean;
    lastCommit: string;
    lastCommitTime: string;
  };
  testes: { pass: number; fail: number };
  recursos: { ramPct: number; discoPct: number };
  rede: Array<{ host: string; ok: boolean }>;
  whatsapp: { adapter: string; mensagens: number; contatos: number };
  pendencias: string[];
}

function sh(cmd: string, cwd: string, fallback = ""): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", timeout: 20_000 }).trim();
  } catch (err: unknown) {
    const e = err as { stdout?: string };
    return (e.stdout ?? fallback).toString().trim();
  }
}

function pct(used: number, total: number): number {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}

function checkHost(host: string): boolean {
  const code = sh(`curl -s -o /dev/null -w "%{http_code}" --max-time 3 "https://${host}"`, ".", "0");
  return parseInt(code, 10) === 200;
}

/** Coleta o estado atual do projeto (git, testes, recursos, rede, WhatsApp). */
export function collectSituacao(projectDir = process.env.PROJECT_DIR ?? "/home/user/rstoi"): Situacao {
  const branch = sh("git branch --show-current", projectDir);
  const clean = sh("git status --short", projectDir) === "";
  const lastCommit = sh("git log -1 --format=%s", projectDir);
  const lastCommitTime = sh("git log -1 --format=%cr", projectDir);

  const testOut = sh("npm test 2>&1", projectDir);
  const testsLine = testOut.match(/^\s*Tests\s+.*$/m)?.[0] ?? "";
  const passMatch = testsLine.match(/(\d+)\s+passed/);
  const failMatch = testsLine.match(/(\d+)\s+failed/);
  const pass = passMatch ? parseInt(passMatch[1], 10) : 0;
  const fail = failMatch ? parseInt(failMatch[1], 10) : 0;

  const memRaw = sh("free -m | grep Mem", projectDir).split(/\s+/);
  const ramPct = pct(parseInt(memRaw[2] || "0", 10), parseInt(memRaw[1] || "0", 10));
  const diskRaw = sh("df -m / | tail -1", projectDir).split(/\s+/);
  const discoPct = pct(parseInt(diskRaw[2] || "0", 10), parseInt(diskRaw[1] || "0", 10));

  const rede = ["github.com", "graph.facebook.com"].map((host) => ({ host, ok: checkHost(host) }));

  const dbPath = join(projectDir, config.dbPath.replace(/^\.\//, ""));
  const dbExists = existsSync(dbPath);
  const mensagens = dbExists
    ? parseInt(sh(`sqlite3 "${dbPath}" 'SELECT COUNT(*) FROM messages;'`, projectDir, "0"), 10)
    : 0;
  const contatos = dbExists
    ? parseInt(sh(`sqlite3 "${dbPath}" 'SELECT COUNT(*) FROM contacts;'`, projectDir, "0"), 10)
    : 0;

  const pendencias: string[] = [];
  if (!clean) pendencias.push("Working tree com mudanças não commitadas");
  if (fail > 0) pendencias.push(`${fail} teste(s) falhando`);
  if (config.adapter === "cloud-api" && !process.env.WA_ACCESS_TOKEN) {
    pendencias.push("Credenciais da Meta Cloud API pendentes (WA_ACCESS_TOKEN)");
  }
  for (const r of rede) {
    if (!r.ok) pendencias.push(`Rede: ${r.host} inacessível`);
  }
  if (dbExists) {
    try {
      statSync(dbPath);
    } catch {
      pendencias.push("Banco SQLite inacessível");
    }
  }

  return {
    ts: new Date().toISOString(),
    git: { branch, clean, lastCommit, lastCommitTime },
    testes: { pass, fail },
    recursos: { ramPct, discoPct },
    rede,
    whatsapp: { adapter: config.adapter, mensagens, contatos },
    pendencias,
  };
}
