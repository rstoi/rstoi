// Testes de rede executados no computador de cada pessoa do time. Todos são
// "best effort" e multiplataforma (Linux/macOS/Windows) — nenhum depende de
// serviço externo além do próprio servidor do assistente (para o speedtest).
import { execFile } from "child_process";
import { promisify } from "util";
import { randomBytes } from "crypto";
import dns from "dns";
import os from "os";

const execFileAsync = promisify(execFile);

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface PingResult {
  target: string;
  latencyMs: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
}

export async function pingHost(host: string, count = 8): Promise<PingResult> {
  const platform = os.platform();
  const args =
    platform === "win32"
      ? ["-n", String(count), host]
      : platform === "darwin"
        ? ["-c", String(count), host]
        : ["-c", String(count), "-i", "0.2", host];

  try {
    const { stdout } = await execFileAsync("ping", args, { timeout: 15000 });
    return parsePingOutput(host, stdout, platform);
  } catch (err) {
    const stdout = (err as { stdout?: string }).stdout;
    if (stdout) return parsePingOutput(host, stdout, platform);
    return { target: host, latencyMs: null, jitterMs: null, packetLossPct: 100 };
  }
}

export function parsePingOutput(host: string, output: string, platform: NodeJS.Platform): PingResult {
  const samples: number[] = [];
  const timeRegex = /time[=<]([\d.]+)\s*ms/gi;
  let m: RegExpExecArray | null;
  while ((m = timeRegex.exec(output))) samples.push(parseFloat(m[1]));

  let lossPct: number | null = null;
  const lossMatch = output.match(/([\d.]+)%\s*(packet loss|perda)/i);
  if (lossMatch) lossPct = parseFloat(lossMatch[1]);
  else if (platform === "win32") {
    const wLoss = output.match(/\((\d+)%\s*loss\)/i);
    if (wLoss) lossPct = parseFloat(wLoss[1]);
  }

  if (!samples.length) {
    return { target: host, latencyMs: null, jitterMs: null, packetLossPct: lossPct ?? 100 };
  }

  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const jitter =
    samples.length > 1
      ? samples.slice(1).reduce((sum, v, i) => sum + Math.abs(v - samples[i]), 0) / (samples.length - 1)
      : 0;

  return { target: host, latencyMs: round(avg), jitterMs: round(jitter), packetLossPct: lossPct ?? 0 };
}

export async function dnsCheck(hostname = "google.com"): Promise<number | null> {
  const start = performance.now();
  try {
    await dns.promises.resolve(hostname);
    return round(performance.now() - start);
  } catch {
    return null;
  }
}

export interface WifiInfo {
  ssid: string | null;
  dbm: number | null;
  pct: number | null;
}

/** Best-effort: retorna tudo null se conectado por cabo ou se a ferramenta do SO não estiver disponível. */
export async function wifiSignal(): Promise<WifiInfo> {
  const platform = os.platform();
  try {
    if (platform === "linux") {
      const { stdout } = await execFileAsync("nmcli", ["-t", "-f", "active,signal,ssid", "dev", "wifi"], {
        timeout: 5000,
      });
      const line = stdout.split("\n").find((l) => l.startsWith("yes:"));
      if (line) {
        const [, signal, ...ssidParts] = line.split(":");
        return { ssid: ssidParts.join(":") || null, dbm: null, pct: signal ? Number(signal) : null };
      }
    } else if (platform === "darwin") {
      const airportPath =
        "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport";
      const { stdout } = await execFileAsync(airportPath, ["-I"], { timeout: 5000 });
      const rssi = stdout.match(/agrCtlRSSI:\s*(-?\d+)/);
      const ssid = stdout.match(/\sSSID:\s*(.+)/);
      return { ssid: ssid ? ssid[1].trim() : null, dbm: rssi ? Number(rssi[1]) : null, pct: null };
    } else if (platform === "win32") {
      const { stdout } = await execFileAsync("netsh", ["wlan", "show", "interfaces"], { timeout: 5000 });
      const signal = stdout.match(/Signal\s*:\s*(\d+)%/);
      const ssid = stdout.match(/^\s*SSID\s*:\s*(.+)$/m);
      return { ssid: ssid ? ssid[1].trim() : null, dbm: null, pct: signal ? Number(signal[1]) : null };
    }
  } catch {
    // sem Wi-Fi ativo (ex.: cabo) ou ferramenta indisponível — não é um erro fatal
  }
  return { ssid: null, dbm: null, pct: null };
}

export async function downloadSpeedTest(
  serverUrl: string,
  token: string,
  bytes = 8_000_000,
): Promise<number | null> {
  const start = performance.now();
  try {
    const res = await fetch(`${serverUrl}/speedtest/download?bytes=${bytes}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const elapsedS = (performance.now() - start) / 1000;
    if (elapsedS <= 0 || buf.byteLength === 0) return null;
    return round((buf.byteLength * 8) / elapsedS / 1e6);
  } catch {
    return null;
  }
}

export async function uploadSpeedTest(serverUrl: string, token: string, bytes = 4_000_000): Promise<number | null> {
  const payload = randomBytes(bytes);
  const start = performance.now();
  try {
    const res = await fetch(`${serverUrl}/speedtest/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
      body: payload,
    });
    if (!res.ok) return null;
    const elapsedS = (performance.now() - start) / 1000;
    if (elapsedS <= 0) return null;
    return round((bytes * 8) / elapsedS / 1e6);
  } catch {
    return null;
  }
}
