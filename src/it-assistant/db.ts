import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dbPath = process.env.IT_ASSISTANT_DB_PATH ?? "./data/it-assistant.db";
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,   -- Google "sub"
      email       TEXT UNIQUE NOT NULL,
      name        TEXT,
      picture     TEXT,
      role        TEXT NOT NULL DEFAULT 'member', -- member | admin
      created_at  TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS devices (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id),
      name          TEXT NOT NULL,
      location      TEXT,
      token_hash    TEXT UNIQUE NOT NULL,
      created_at    TEXT NOT NULL,
      last_seen_at  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

    CREATE TABLE IF NOT EXISTS reports (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id         TEXT NOT NULL REFERENCES devices(id),
      ts                TEXT NOT NULL,
      target            TEXT,
      latency_ms        REAL,
      jitter_ms         REAL,
      packet_loss_pct   REAL,
      dns_ms            REAL,
      download_mbps     REAL,
      upload_mbps       REAL,
      wifi_ssid         TEXT,
      wifi_signal_dbm   REAL,
      wifi_signal_pct   REAL,
      status            TEXT NOT NULL,   -- ok | warning | critical
      reasons_json      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_reports_device_ts ON reports(device_id, ts);

    CREATE TABLE IF NOT EXISTS alerts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id    TEXT NOT NULL REFERENCES devices(id),
      ts           TEXT NOT NULL,
      severity     TEXT NOT NULL,  -- warning | critical
      message      TEXT NOT NULL,
      resolved_at  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts(device_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_open ON alerts(resolved_at);
  `);
}

export function closeDb(): void {
  db?.close();
  db = null;
}
