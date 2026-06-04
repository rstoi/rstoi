import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HttpClient } from "../../src/adapters/http/index.js";
import { closeDb } from "../../src/store/db.js";

process.env["SQLITE_DB_PATH"] = ":memory:";
process.env["WA_HTTP_PHONE"] = "5511999990000";
process.env["WA_HTTP_SEND_URL"] = ""; // local-only mode

describe("HttpClient adapter", () => {
  let adapter: HttpClient;

  beforeEach(async () => {
    adapter = new HttpClient();
    await adapter.connect();
  });

  afterEach(() => {
    closeDb();
  });

  it("connects and reports connected", () => {
    expect(adapter.isConnected()).toBe(true);
  });

  it("sends a text message and stores it locally", async () => {
    const sent = await adapter.sendMessage("5511888880000", { text: "Olá!" });
    expect(sent.id).toBeTruthy();
    expect(typeof sent.timestamp).toBe("number");

    const msgs = await adapter.getMessages("5511888880000");
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.text).toBe("Olá!");
    expect(msgs[0]!.isFromMe).toBe(true);
  });

  it("receives a message via webhook payload", async () => {
    await adapter.processWebhookPayload({
      messageId: "inbound-1",
      from: "5511777770000",
      fromName: "Alice",
      type: "text",
      text: "Oi, tudo bem?",
      timestamp: Date.now(),
    });

    const msgs = await adapter.getMessages("5511777770000");
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.text).toBe("Oi, tudo bem?");
    expect(msgs[0]!.fromName).toBe("Alice");
    expect(msgs[0]!.isFromMe).toBe(false);
  });

  it("fires onMessage callback on inbound message", async () => {
    const received: unknown[] = [];
    adapter.onMessage = (m) => received.push(m);

    await adapter.processWebhookPayload({
      messageId: "cb-1",
      from: "5511666660000",
      type: "text",
      text: "callback test",
    });

    expect(received).toHaveLength(1);
  });

  it("receives Meta Cloud API format webhook", async () => {
    await adapter.processWebhookPayload({
      entry: [{
        changes: [{
          value: {
            contacts: [{ wa_id: "5511555550000", profile: { name: "Bob" } }],
            messages: [{
              id: "meta-msg-1",
              from: "5511555550000",
              type: "text",
              text: { body: "Meta format!" },
              timestamp: "1700000000",
            }],
            statuses: [],
          },
        }],
      }],
    });

    const msgs = await adapter.getMessages("5511555550000");
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.text).toBe("Meta format!");
    expect(msgs[0]!.fromName).toBe("Bob");
  });

  it("edits a message locally", async () => {
    const sent = await adapter.sendMessage("5511888880000", { text: "original" });
    await adapter.editMessage(sent.id, "5511888880000", "editado");
    const msg = await adapter.getMessage(sent.id);
    expect(msg?.text).toBe("editado");
  });

  it("deletes a message locally", async () => {
    const sent = await adapter.sendMessage("5511888880000", { text: "apagar" });
    await adapter.deleteMessage(sent.id, "5511888880000");
    const msg = await adapter.getMessage(sent.id);
    expect(msg).toBeNull();
  });

  it("marks message as read", async () => {
    const sent = await adapter.sendMessage("5511888880000", { text: "leia-me" });
    await adapter.markAsRead("5511888880000", sent.id);
    const msg = await adapter.getMessage(sent.id);
    expect(msg?.status).toBe("read");
  });

  it("lists chats after messages", async () => {
    await adapter.sendMessage("5511111110000", { text: "chat A" });
    await adapter.sendMessage("5511222220000", { text: "chat B" });
    const chats = await adapter.listChats();
    expect(chats.length).toBeGreaterThanOrEqual(2);
  });

  it("creates, reads, and manages a group", async () => {
    const group = await adapter.createGroup("Time de QA", ["5511111110000", "5511222220000"]);
    expect(group.name).toBe("Time de QA");
    expect(group.members).toHaveLength(2);

    await adapter.addGroupMember(group.id, "5511333330000");
    const updated = await adapter.getGroup(group.id);
    expect(updated?.members).toHaveLength(3);

    await adapter.promoteGroupMember(group.id, "5511333330000");
    const promoted = await adapter.getGroup(group.id);
    expect(promoted?.members.find(m => m.id === "5511333330000")?.isAdmin).toBe(true);

    await adapter.removeGroupMember(group.id, "5511333330000");
    const shrunk = await adapter.getGroup(group.id);
    expect(shrunk?.members).toHaveLength(2);
  });

  it("blocks and unblocks a contact", async () => {
    const db = (await import("../../src/store/db.js")).getDb();
    db.prepare("INSERT INTO contacts (id, phone) VALUES (?, ?)").run("5511444440000", "5511444440000");

    await adapter.blockContact("5511444440000");
    const blocked = await adapter.getContact("5511444440000");
    expect(blocked?.isBlocked).toBe(true);

    await adapter.unblockContact("5511444440000");
    const unblocked = await adapter.getContact("5511444440000");
    expect(unblocked?.isBlocked).toBe(false);
  });

  it("returns business profile", async () => {
    const profile = await adapter.getBusinessProfile();
    expect(profile.phone).toBe("5511999990000");
    expect(typeof profile.name).toBe("string");
  });

  it("verifies webhook token", () => {
    process.env["WA_WEBHOOK_VERIFY_TOKEN"] = "test-token-123";
    const challenge = adapter.verifyWebhook!("test-token-123", "challenge-xyz");
    expect(challenge).toBe("challenge-xyz");
  });

  it("rejects invalid webhook token", () => {
    process.env["WA_WEBHOOK_VERIFY_TOKEN"] = "correct-token";
    expect(() => adapter.verifyWebhook!("wrong-token", "ch")).toThrow();
  });

  it("uploads media in local-only mode", async () => {
    const result = await adapter.uploadMedia(Buffer.from("fake-image"), "image/jpeg", "test.jpg");
    expect(result.mediaId).toBeTruthy();
    expect(result.mimeType).toBe("image/jpeg");
  });
});
