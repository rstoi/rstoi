import { describe, it, expect, beforeEach, afterEach } from "vitest";

process.env["BMP_DB_PATH"] = ":memory:";

import {
  getBmpDb,
  closeBmpDb,
  registrarMovimentacoes,
  iniciarSyncLog,
  concluirSyncLog,
  resumoDoDia,
} from "../../src/bmp/store.js";
import { linhaToMovimentacao } from "../../src/bmp/parse.js";
import type { Movimentacao } from "../../src/bmp/types.js";

function mov(over: Partial<Movimentacao> = {}): Movimentacao {
  return {
    id: over.id ?? "bmp-test-1",
    conta: "BMP",
    data: "2026-06-17",
    descricao: "PIX",
    tipo: "credito",
    valor: 100,
    capturadoEm: 1,
    ...over,
  };
}

describe("store BMP", () => {
  beforeEach(() => getBmpDb());
  afterEach(() => closeBmpDb());

  it("registra movimentações e deduplica por id", () => {
    const a = mov({ id: "a", valor: 10 });
    const b = mov({ id: "b", valor: 20, tipo: "debito" });

    const r1 = registrarMovimentacoes([a, b]);
    expect(r1).toEqual({ novas: 2, total: 2 });

    // Reexecução com 'a' repetido + 'c' novo → só 'c' é nova.
    const c = mov({ id: "c", valor: 30 });
    const r2 = registrarMovimentacoes([a, c]);
    expect(r2).toEqual({ novas: 1, total: 2 });

    const total = getBmpDb().prepare("SELECT COUNT(*) AS n FROM bmp_movimentacoes").get() as { n: number };
    expect(total.n).toBe(3);
  });

  it("dedup é idempotente para a mesma linha extraída duas vezes", () => {
    const linha = { data: "17/06/2026", descricao: "Tarifa", valor: "-9,90" };
    const m1 = linhaToMovimentacao(linha, "BMP", 100);
    const m2 = linhaToMovimentacao(linha, "BMP", 999); // capturado em outro instante
    expect(m1.id).toBe(m2.id);
    registrarMovimentacoes([m1]);
    expect(registrarMovimentacoes([m2]).novas).toBe(0);
  });

  it("resumoDoDia agrega créditos e débitos", () => {
    registrarMovimentacoes([
      mov({ id: "x", tipo: "credito", valor: 100 }),
      mov({ id: "y", tipo: "credito", valor: 50 }),
      mov({ id: "z", tipo: "debito", valor: 30 }),
    ]);
    const r = resumoDoDia("2026-06-17");
    expect(r.total).toBe(3);
    expect(r.creditos).toBe(2);
    expect(r.debitos).toBe(1);
    expect(r.totalCredito).toBe(150);
    expect(r.totalDebito).toBe(30);
  });

  it("registra ciclo de sync no log", () => {
    const id = iniciarSyncLog();
    concluirSyncLog(id, { status: "ok", novas: 2, total: 5 });
    const row = getBmpDb().prepare("SELECT * FROM bmp_sync_log WHERE id = ?").get(id) as Record<string, unknown>;
    expect(row["status"]).toBe("ok");
    expect(row["novas"]).toBe(2);
    expect(row["total"]).toBe(5);
    expect(row["concluido_em"]).toBeTypeOf("number");
  });
});
