import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDb, closeDb } from "../../src/store/db.js";

process.env["SQLITE_DB_PATH"] = ":memory:";

describe("message store", () => {
  beforeEach(() => {
    getDb();
  });

  afterEach(() => {
    closeDb();
  });

  it("inserts and retrieves a message", () => {
    const db = getDb();
    db.prepare(`
      INSERT INTO messages (id, chat_id, from_id, type, timestamp, is_group, is_from_me)
      VALUES ('msg1', 'chat1@s.whatsapp.net', 'user1', 'text', 1000, 0, 1)
    `).run();
    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get("msg1") as
      | Record<string, unknown>
      | undefined;
    expect(row?.["id"]).toBe("msg1");
    expect(row?.["chat_id"]).toBe("chat1@s.whatsapp.net");
  });

  it("handles upsert correctly", () => {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO messages (id, chat_id, from_id, type, text, timestamp, is_group, is_from_me)
      VALUES ('msg2', 'chat1@s.whatsapp.net', 'user1', 'text', 'hello', 2000, 0, 0)
    `).run();
    db.prepare(`
      INSERT OR REPLACE INTO messages (id, chat_id, from_id, type, text, timestamp, is_group, is_from_me)
      VALUES ('msg2', 'chat1@s.whatsapp.net', 'user1', 'text', 'updated', 2000, 0, 0)
    `).run();
    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get("msg2") as
      | Record<string, unknown>
      | undefined;
    expect(row?.["text"]).toBe("updated");
  });

  it("filters messages by chat_id", () => {
    const db = getDb();
    db.prepare(`INSERT INTO messages (id, chat_id, from_id, type, timestamp, is_group, is_from_me) VALUES ('a', 'chatA', 'u', 'text', 1, 0, 0)`).run();
    db.prepare(`INSERT INTO messages (id, chat_id, from_id, type, timestamp, is_group, is_from_me) VALUES ('b', 'chatB', 'u', 'text', 2, 0, 0)`).run();
    const rows = db.prepare("SELECT * FROM messages WHERE chat_id = ?").all("chatA");
    expect(rows).toHaveLength(1);
  });

  it("creates groups table", () => {
    const db = getDb();
    db.prepare(`INSERT OR REPLACE INTO groups (id, name) VALUES ('g1', 'Test Group')`).run();
    const row = db.prepare("SELECT * FROM groups WHERE id = ?").get("g1") as
      | Record<string, unknown>
      | undefined;
    expect(row?.["name"]).toBe("Test Group");
  });

  it("creates contacts table", () => {
    const db = getDb();
    db.prepare(`INSERT INTO contacts (id, phone, name) VALUES ('5511@s.whatsapp.net', '5511', 'Alice')`).run();
    const row = db.prepare("SELECT * FROM contacts WHERE id = ?").get("5511@s.whatsapp.net") as
      | Record<string, unknown>
      | undefined;
    expect(row?.["name"]).toBe("Alice");
  });

  it("updates message status", () => {
    const db = getDb();
    db.prepare(`
      INSERT INTO messages (id, chat_id, from_id, type, timestamp, is_group, is_from_me, status)
      VALUES ('m3', 'c1', 'u1', 'text', 100, 0, 1, 'sent')
    `).run();
    db.prepare("UPDATE messages SET status = ? WHERE id = ?").run("read", "m3");
    const row = db.prepare("SELECT status FROM messages WHERE id = ?").get("m3") as
      | Record<string, unknown>
      | undefined;
    expect(row?.["status"]).toBe("read");
  });
});
