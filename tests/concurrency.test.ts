import { describe, it, expect, vi } from "vitest";
import { runExclusive, Gate } from "../src/concurrency.js";

describe("runExclusive", () => {
  it("não roda de forma reentrante (descarta chamadas sobrepostas)", async () => {
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    const wrapped = runExclusive(async () => {
      runs++;
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
    });

    // Dispara 5 chamadas "ao mesmo tempo": só a primeira executa.
    const results = await Promise.all([wrapped(), wrapped(), wrapped(), wrapped(), wrapped()]);

    expect(maxActive).toBe(1);
    expect(runs).toBe(1);
    expect(results.filter((r) => r === undefined).length).toBe(5); // todas resolvem undefined
  });

  it("permite uma nova execução depois que a anterior termina", async () => {
    let runs = 0;
    const wrapped = runExclusive(async () => { runs++; });
    await wrapped();
    await wrapped();
    expect(runs).toBe(2);
  });

  it("libera o lock mesmo se a tarefa lançar", async () => {
    let runs = 0;
    const wrapped = runExclusive(async () => { runs++; throw new Error("boom"); });
    await expect(wrapped()).rejects.toThrow("boom");
    await expect(wrapped()).rejects.toThrow("boom"); // não ficou travado
    expect(runs).toBe(2);
  });
});

describe("Gate", () => {
  it("impede dois comandos simultâneos na mesma chave", () => {
    const g = new Gate(5);
    expect(g.tryAcquire("chatA")).toBe(true);
    expect(g.tryAcquire("chatA")).toBe(false); // mesma chave, ocupada
    expect(g.reason("chatA")).toBe("key-busy");
    g.release("chatA");
    expect(g.tryAcquire("chatA")).toBe(true);   // liberada, aceita de novo
  });

  it("respeita a capacidade global entre chaves distintas", () => {
    const g = new Gate(2);
    expect(g.tryAcquire("a")).toBe(true);
    expect(g.tryAcquire("b")).toBe(true);
    expect(g.inFlight).toBe(2);
    expect(g.tryAcquire("c")).toBe(false);      // cheio
    expect(g.reason("c")).toBe("at-capacity");
    g.release("a");
    expect(g.tryAcquire("c")).toBe(true);        // abriu vaga
  });

  it("release é idempotente e não conta slot negativo", () => {
    const g = new Gate(1);
    g.tryAcquire("a");
    g.release("a");
    g.release("a"); // segunda liberação é no-op
    expect(g.inFlight).toBe(0);
    expect(g.tryAcquire("b")).toBe(true);
  });

  it("rejeita maxConcurrent inválido", () => {
    expect(() => new Gate(0)).toThrow();
  });
});
