import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dbPath = process.env.SQLITE_DB_PATH ?? "./data/whatsapp.db";
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id                TEXT PRIMARY KEY,
      chat_id           TEXT NOT NULL,
      from_id           TEXT NOT NULL,
      from_name         TEXT,
      type              TEXT NOT NULL DEFAULT 'text',
      text              TEXT,
      media_id          TEXT,
      media_url         TEXT,
      mime_type         TEXT,
      file_name         TEXT,
      quoted_message_id TEXT,
      timestamp         INTEGER NOT NULL,
      is_group          INTEGER NOT NULL DEFAULT 0,
      is_from_me        INTEGER NOT NULL DEFAULT 0,
      status            TEXT DEFAULT 'sent'
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_id   ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_from_id   ON messages(from_id);

    CREATE TABLE IF NOT EXISTS groups (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      members     TEXT DEFAULT '[]',
      created_at  INTEGER,
      invite_link TEXT,
      picture_url TEXT
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id              TEXT PRIMARY KEY,
      name            TEXT,
      push_name       TEXT,
      business_name   TEXT,
      phone           TEXT,
      picture_url     TEXT,
      status_message  TEXT,
      is_blocked      INTEGER DEFAULT 0
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
    USING fts5(id UNINDEXED, chat_id UNINDEXED, text,
               content='messages', content_rowid='rowid');

    CREATE TRIGGER IF NOT EXISTS messages_fts_insert
    AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, id, chat_id, text)
      VALUES (new.rowid, new.id, new.chat_id, new.text);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_fts_update
    AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, id, chat_id, text)
      VALUES ('delete', old.rowid, old.id, old.chat_id, old.text);
      INSERT INTO messages_fts(rowid, id, chat_id, text)
      VALUES (new.rowid, new.id, new.chat_id, new.text);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_fts_delete
    AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, id, chat_id, text)
      VALUES ('delete', old.rowid, old.id, old.chat_id, old.text);
    END;
  `);
}

export function closeDb(): void {
  db?.close();
  db = null;
}
