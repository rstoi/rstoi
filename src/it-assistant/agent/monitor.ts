#!/usr/bin/env node
// Agente de monitoramento de rede doméstica — roda no computador de cada
// pessoa do time (via cron/Task Scheduler/launchd) e envia métricas ao
// Assistente de Infraestrutura de TI. Ver README.md nesta pasta para
// instruções de instalação.
import { fileURLToPath } from "url";
import { pingHost, dnsCheck, wifiSignal, downloadSpeedTest, uploadSpeedTest } from "./checks.js";

const SERVER_URL = (process.env.IT_ASSISTANT_SERVER_URL ?? "").replace(/\/+$/, "");
const TOKEN = process.env.IT_ASSISTANT_DEVICE_TOKEN;
const PING_TARGETS = (process.env.IT_ASSISTANT_PING_TARGETS ?? "1.1.1.1,8.8.8.8")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DNS_HOST = process.env.IT_ASSISTANT_DNS_HOST ?? "google.com";
const DOWNLOAD_BYTES = Number(process.env.IT_ASSISTANT_SPEEDTEST_DOWNLOAD_BYTES ?? 8_000_000);
const UPLOAD_BYTES = Number(process.env.IT_ASSISTANT_SPEEDTEST_UPLOAD_BYTES ?? 4_000_000);
const INTERVAL_MIN = Number(process.env.IT_ASSISTANT_INTERVAL_MIN ?? 5);

async function runOnce(): Promise<void> {
  if (!SERVER_URL || !TOKEN) {
    console.error(
      "[it-assistant-agent] Configure IT_ASSISTANT_SERVER_URL e IT_ASSISTANT_DEVICE_TOKEN (gerados no painel web ao adicionar um dispositivo).",
    );
    process.exitCode = 1;
    return;
  }

  const pings = await Promise.all(PING_TARGETS.map((t) => pingHost(t)));
  const reachable = pings.filter((p) => p.latencyMs !== null);
  const best =
    reachable.sort((a, b) => (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity))[0] ?? pings[0];

  const [dnsMs, wifi, downloadMbps, uploadMbps] = await Promise.all([
    dnsCheck(DNS_HOST),
    wifiSignal(),
    downloadSpeedTest(SERVER_URL, TOKEN, DOWNLOAD_BYTES),
    uploadSpeedTest(SERVER_URL, TOKEN, UPLOAD_BYTES),
  ]);

  const report = {
    ts: new Date().toISOString(),
    target: best?.target ?? null,
    latencyMs: best?.latencyMs ?? null,
    jitterMs: best?.jitterMs ?? null,
    packetLossPct: best?.packetLossPct ?? null,
    dnsMs,
    downloadMbps,
    uploadMbps,
    wifiSsid: wifi.ssid,
    wifiSignalDbm: wifi.dbm,
    wifiSignalPct: wifi.pct,
  };

  try {
    const res = await fetch(`${SERVER_URL}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(report),
    });
    const body = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
    if (!res.ok) {
      console.error(`[it-assistant-agent] servidor recusou o relatório (${res.status}):`, body.error ?? body);
      process.exitCode = 1;
      return;
    }
    console.log(
      `[it-assistant-agent] status=${body.status} alvo=${report.target} latência=${report.latencyMs}ms ` +
        `jitter=${report.jitterMs}ms perda=${report.packetLossPct}% dns=${report.dnsMs}ms ` +
        `download=${report.downloadMbps}Mbps upload=${report.uploadMbps}Mbps` +
        (wifi.ssid ? ` wifi="${wifi.ssid}"` : ""),
    );
  } catch (err) {
    console.error("[it-assistant-agent] falha ao enviar relatório:", (err as Error).message);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--watch")) {
    console.log(`[it-assistant-agent] modo contínuo — verificando a cada ${INTERVAL_MIN} min`);
    runOnce();
    setInterval(runOnce, INTERVAL_MIN * 60_000);
  } else {
    runOnce();
  }
}
