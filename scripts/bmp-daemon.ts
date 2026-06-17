#!/usr/bin/env tsx
/**
 * Daemon do Banco BMP — mantém o processo vivo e sincroniza o extrato
 * diariamente no horário configurado (padrão 01:00 America/Sao_Paulo).
 *
 * Uso:
 *   npm run bmp:daemon
 *
 * Observação (ambiente efêmero): o daemon só roda enquanto o processo está
 * vivo. Para autonomia diária resiliente a reboots, prefira disparar
 * `npm run bmp:sync` via um gatilho agendado da plataforma. Ver docs/BANCO-BMP.md.
 */

import { runSync, resumoLegivel } from "../src/bmp/agent.js";
import { startDailyScheduler } from "../src/bmp/scheduler.js";
import { loadBmpConfig } from "../src/bmp/config.js";
import { closeBmpDb } from "../src/bmp/store.js";

function formataProxima(ms: number, tz: string): string {
  const alvo = new Date(Date.now() + ms);
  const horas = Math.floor(ms / 3_600_000);
  const min = Math.round((ms % 3_600_000) / 60_000);
  return `${alvo.toLocaleString("pt-BR", { timeZone: tz })} (em ~${horas}h${min}m)`;
}

async function main(): Promise<void> {
  const cfg = loadBmpConfig();
  const hhmm = `${String(cfg.runHour).padStart(2, "0")}:${String(cfg.runMinute).padStart(2, "0")}`;

  console.error("\n╔══════════════════════════════════════════════════╗");
  console.error(  "║  Agente Banco BMP — sincronização diária          ║");
  console.error(`  ║  Horário: ${hhmm} ${cfg.timezone.padEnd(28)}║`);
  console.error(  "╚══════════════════════════════════════════════════╝\n");

  const stop = startDailyScheduler(
    async () => {
      console.error(`[bmp] Disparo agendado (${hhmm} ${cfg.timezone})…`);
      const res = await runSync(cfg);
      if (res.ok) console.error(resumoLegivel());
    },
    {
      hour: cfg.runHour,
      minute: cfg.runMinute,
      timeZone: cfg.timezone,
      onError: (e) => console.error("[bmp] erro na execução agendada:", e),
      onSchedule: (ms) => console.error(`[bmp] Próxima sincronização: ${formataProxima(ms, cfg.timezone)}`),
    },
  );

  const encerrar = () => {
    console.error("\n→ Encerrando daemon BMP…");
    stop();
    closeBmpDb();
    process.exit(0);
  };
  process.on("SIGINT", encerrar);
  process.on("SIGTERM", encerrar);

  // Mantém o processo vivo.
  await new Promise<void>(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
