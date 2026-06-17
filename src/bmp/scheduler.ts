/**
 * Agendador diário simples e testável.
 *
 * `msUntilNextRun` é pura: dado um instante e um horário-alvo num fuso, calcula
 * quantos milissegundos faltam para a próxima ocorrência. `startDailyScheduler`
 * usa-a para reagendar a cada execução (sem depender de libs de cron).
 *
 * IMPORTANTE: este agendador roda enquanto o PROCESSO está vivo. No ambiente
 * efêmero do Claude Code na web, mantê-lo "para sempre" não é garantido após
 * reboots — para autonomia real, dispare `npm run bmp:sync` via um gatilho da
 * plataforma às 01:00. Ver `docs/BANCO-BMP.md`.
 */

/** Milissegundos até a próxima ocorrência de `hour:minute` no fuso informado. */
export function msUntilNextRun(
  now: Date,
  hour: number,
  minute: number,
  timeZone = "America/Sao_Paulo",
): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);

  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  let h = get("hour");
  if (h === 24) h = 0; // alguns ambientes emitem "24" para meia-noite

  const nowSec = h * 3600 + get("minute") * 60 + get("second");
  const targetSec = hour * 3600 + minute * 60;

  let deltaSec = targetSec - nowSec;
  if (deltaSec <= 0) deltaSec += 86_400; // já passou hoje → amanhã

  return deltaSec * 1000 - now.getMilliseconds();
}

export interface SchedulerOptions {
  hour: number;
  minute: number;
  timeZone?: string;
  onError?: (err: unknown) => void;
  /** Callback informativo a cada (re)agendamento, com o ms calculado. */
  onSchedule?: (msAteProxima: number) => void;
}

/**
 * Executa `task` diariamente no horário configurado. Retorna uma função para
 * cancelar o agendamento.
 */
export function startDailyScheduler(
  task: () => void | Promise<void>,
  opts: SchedulerOptions,
): () => void {
  let parado = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const agendar = (): void => {
    if (parado) return;
    const ms = msUntilNextRun(new Date(), opts.hour, opts.minute, opts.timeZone);
    opts.onSchedule?.(ms);
    timer = setTimeout(() => {
      void (async () => {
        try {
          await task();
        } catch (err) {
          opts.onError?.(err);
        }
        agendar();
      })();
    }, ms);
  };

  agendar();

  return () => {
    parado = true;
    if (timer) clearTimeout(timer);
  };
}
