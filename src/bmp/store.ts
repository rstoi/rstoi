/**
 * Armazenamento das movimentações do Banco BMP (SQLite, better-sqlite3).
 *
 * Banco separado do WhatsApp (`BMP_DB_PATH`, padrão `./data/bmp.db`) com
 * deduplicação por `id` (hash estável) — a sincronização diária é idempotente.
 *
 * Atenção (ambiente efêmero): em `data/` o histórico NÃO sobrevive a reboots
 * do container, a menos que o arquivo seja persistido externamente. Ver
 * `docs/BANCO-BMP.md`.
 */

import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import type { Movimentacao } from "./types.js";

let db: Database.Database | null = null;

export function getBmpDb(): Database.Database {
  if (db) return db;
  const dbPath = process.env.BMP_DB_PATH ?? "./data/bmp.db";
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bmp_movimentacoes (
      id            TEXT PRIMARY KEY,
      conta         TEXT NOT NULL,
      data          TEXT NOT NULL,
      descricao     TEXT NOT NULL,
      documento     TEXT,
      tipo          TEXT NOT NULL,
      valor         REAL NOT NULL,
      saldo         REAL,
      categoria     TEXT,
      raw           TEXT,
      capturado_em  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bmp_mov_data  ON bmp_movimentacoes(data);
    CREATE INDEX IF NOT EXISTS idx_bmp_mov_conta ON bmp_movimentacoes(conta);
    CREATE INDEX IF NOT EXISTS idx_bmp_mov_tipo  ON bmp_movimentacoes(tipo);

    CREATE TABLE IF NOT EXISTS bmp_sync_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      iniciado_em   INTEGER NOT NULL,
      concluido_em  INTEGER,
      status        TEXT NOT NULL,
      novas         INTEGER NOT NULL DEFAULT 0,
      total         INTEGER NOT NULL DEFAULT 0,
      erro          TEXT
    );
  `);
}

/**
 * Registra movimentações de forma idempotente (INSERT OR IGNORE por `id`).
 * Retorna quantas eram realmente novas e o total processado.
 */
export function registrarMovimentacoes(movs: Movimentacao[]): { novas: number; total: number } {
  const database = getBmpDb();
  const stmt = database.prepare(`
    INSERT OR IGNORE INTO bmp_movimentacoes
      (id, conta, data, descricao, documento, tipo, valor, saldo, categoria, raw, capturado_em)
    VALUES
      (@id, @conta, @data, @descricao, @documento, @tipo, @valor, @saldo, @categoria, @raw, @capturadoEm)
  `);

  let novas = 0;
  const tx = database.transaction((rows: Movimentacao[]) => {
    for (const m of rows) {
      const info = stmt.run({
        id: m.id,
        conta: m.conta,
        data: m.data,
        descricao: m.descricao,
        documento: m.documento ?? null,
        tipo: m.tipo,
        valor: m.valor,
        saldo: m.saldo ?? null,
        categoria: m.categoria ?? null,
        raw: m.raw ?? null,
        capturadoEm: m.capturadoEm,
      });
      if (info.changes > 0) novas++;
    }
  });
  tx(movs);

  return { novas, total: movs.length };
}

export function iniciarSyncLog(): number {
  const database = getBmpDb();
  const info = database
    .prepare("INSERT INTO bmp_sync_log (iniciado_em, status) VALUES (?, 'em_andamento')")
    .run(Date.now());
  return Number(info.lastInsertRowid);
}

export function concluirSyncLog(
  id: number,
  res: { status: "ok" | "erro"; novas?: number; total?: number; erro?: string },
): void {
  const database = getBmpDb();
  database
    .prepare(
      "UPDATE bmp_sync_log SET concluido_em = ?, status = ?, novas = ?, total = ?, erro = ? WHERE id = ?",
    )
    .run(Date.now(), res.status, res.novas ?? 0, res.total ?? 0, res.erro ?? null, id);
}

export interface ResumoDia {
  data: string;
  total: number;
  creditos: number;
  debitos: number;
  totalCredito: number;
  totalDebito: number;
}

/** Resumo agregado das movimentações de um dia (padrão: hoje). */
export function resumoDoDia(data?: string): ResumoDia {
  const database = getBmpDb();
  const dia = data ?? new Date().toISOString().slice(0, 10);
  const row = database
    .prepare(
      `SELECT
         COUNT(*)                                              AS total,
         SUM(CASE WHEN tipo = 'credito' THEN 1 ELSE 0 END)     AS creditos,
         SUM(CASE WHEN tipo = 'debito'  THEN 1 ELSE 0 END)     AS debitos,
         COALESCE(SUM(CASE WHEN tipo = 'credito' THEN valor END), 0) AS totalCredito,
         COALESCE(SUM(CASE WHEN tipo = 'debito'  THEN valor END), 0) AS totalDebito
       FROM bmp_movimentacoes
       WHERE data = ?`,
    )
    .get(dia) as Record<string, number>;

  return {
    data: dia,
    total: row["total"] ?? 0,
    creditos: row["creditos"] ?? 0,
    debitos: row["debitos"] ?? 0,
    totalCredito: row["totalCredito"] ?? 0,
    totalDebito: row["totalDebito"] ?? 0,
  };
}

export function closeBmpDb(): void {
  db?.close();
  db = null;
}
