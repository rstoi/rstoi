/**
 * Controle de concorrência para evitar acúmulo de requisições de entrada.
 *
 * Dois problemas distintos motivam este módulo:
 *
 *  1. Reentrância de loops assíncronos (ex.: polling do WhatsApp Web).
 *     `runExclusive` garante que uma tarefa async nunca rode sobreposta a
 *     si mesma — chamadas concorrentes são ignoradas enquanto uma está em voo.
 *
 *  2. Comandos disparados em paralelo em diversas sessões/chats (ex.: vários
 *     `/setup` chegando ao mesmo tempo). `Gate` faz *load shedding*: limita o
 *     total simultâneo e impede dois comandos concorrentes no mesmo chat,
 *     rejeitando o excedente em vez de enfileirá-lo indefinidamente.
 */

/**
 * Envelopa uma função async de modo que ela nunca rode de forma reentrante.
 * Se já houver uma execução em andamento, a nova chamada é descartada e
 * resolve para `undefined`. Ideal para timers `setInterval`/polling cujo
 * trabalho pode demorar mais que o intervalo.
 */
export function runExclusive<T>(fn: () => Promise<T>): () => Promise<T | undefined> {
  let running = false;
  return async () => {
    if (running) return undefined;
    running = true;
    try {
      return await fn();
    } finally {
      running = false;
    }
  };
}

/**
 * Limitador de concorrência com chave. Reserva um "slot" por requisição:
 *  - no máximo `maxConcurrent` slots ativos ao mesmo tempo (capacidade global);
 *  - no máximo uma requisição ativa por `key` (ex.: um comando por chat).
 *
 * `tryAcquire` é não-bloqueante: devolve `false` quando não há vaga, deixando
 * o chamador decidir o que fazer (ex.: responder "ocupado") em vez de empilhar
 * trabalho. Sempre pareie um `tryAcquire` bem-sucedido com `release` (use
 * try/finally).
 */
export class Gate {
  private active = 0;
  private readonly busyKeys = new Set<string>();

  constructor(private readonly maxConcurrent: number) {
    if (maxConcurrent < 1) throw new Error("maxConcurrent deve ser >= 1");
  }

  /** Reserva um slot para `key`. Retorna `false` se já ocupado/sem vaga. */
  tryAcquire(key: string): boolean {
    if (this.busyKeys.has(key)) return false;          // já há trabalho para esta chave
    if (this.active >= this.maxConcurrent) return false; // capacidade global esgotada
    this.busyKeys.add(key);
    this.active++;
    return true;
  }

  /** Libera o slot de `key`. Idempotente. */
  release(key: string): void {
    if (this.busyKeys.delete(key)) this.active--;
  }

  /** Motivo da recusa, para mensagens de retorno mais úteis. */
  reason(key: string): "key-busy" | "at-capacity" | "ok" {
    if (this.busyKeys.has(key)) return "key-busy";
    if (this.active >= this.maxConcurrent) return "at-capacity";
    return "ok";
  }

  get inFlight(): number {
    return this.active;
  }
}
