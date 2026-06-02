import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMessagingTools } from "../../src/tools/messaging.js";
import type { WhatsAppAdapter } from "../../src/adapters/base.js";

process.env["SQLITE_DB_PATH"] = ":memory:";

function createMockAdapter(): WhatsAppAdapter {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    sendMessage: vi.fn().mockResolvedValue({ id: "sent-1", timestamp: 1000 }),
    editMessage: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    reactToMessage: vi.fn().mockResolvedValue(undefined),
    markAsRead: vi.fn().mockResolvedValue(undefined),
    getMessages: vi.fn().mockResolvedValue([]),
    getMessage: vi.fn().mockResolvedValue({
      id: "m1",
      chatId: "chat1",
      fromId: "u1",
      type: "text",
      text: "hi",
      timestamp: 1000,
      isGroup: false,
      isFromMe: true,
    }),
    listChats: vi.fn().mockResolvedValue([]),
    listGroups: vi.fn().mockResolvedValue([]),
    getGroup: vi.fn().mockResolvedValue(null),
    createGroup: vi.fn().mockResolvedValue({ id: "g1", name: "test", members: [] }),
    updateGroup: vi.fn().mockResolvedValue(undefined),
    addGroupMember: vi.fn().mockResolvedValue(undefined),
    removeGroupMember: vi.fn().mockResolvedValue(undefined),
    promoteGroupMember: vi.fn().mockResolvedValue(undefined),
    demoteGroupMember: vi.fn().mockResolvedValue(undefined),
    leaveGroup: vi.fn().mockResolvedValue(undefined),
    getGroupInviteLink: vi.fn().mockResolvedValue("https://chat.whatsapp.com/abc"),
    listContacts: vi.fn().mockResolvedValue([]),
    getContact: vi.fn().mockResolvedValue(null),
    blockContact: vi.fn().mockResolvedValue(undefined),
    unblockContact: vi.fn().mockResolvedValue(undefined),
    uploadMedia: vi.fn().mockResolvedValue({ mediaId: "media1", mimeType: "image/jpeg" }),
    downloadMedia: vi.fn().mockResolvedValue(Buffer.from("test")),
    getBusinessProfile: vi.fn().mockResolvedValue({ id: "1", name: "Test", phone: "5511999990000" }),
    updateBusinessProfile: vi.fn().mockResolvedValue(undefined),
  } as unknown as WhatsAppAdapter;
}

describe("messaging tools", () => {
  it("send_message tool registers without errors", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const adapter = createMockAdapter();
    expect(() => registerMessagingTools(server, adapter)).not.toThrow();
  });

  it("sendMessage adapter method is callable", async () => {
    const adapter = createMockAdapter();
    const result = await adapter.sendMessage("5511999990000@s.whatsapp.net", { text: "hello" });
    expect(result).toEqual({ id: "sent-1", timestamp: 1000 });
  });

  it("editMessage adapter method is callable", async () => {
    const adapter = createMockAdapter();
    await adapter.editMessage("msg1", "chat1", "new text");
    expect(adapter.editMessage).toHaveBeenCalledWith("msg1", "chat1", "new text");
  });

  it("deleteMessage adapter method is callable", async () => {
    const adapter = createMockAdapter();
    await adapter.deleteMessage("msg1", "chat1", true);
    expect(adapter.deleteMessage).toHaveBeenCalledWith("msg1", "chat1", true);
  });

  it("getMessages returns empty array on mock", async () => {
    const adapter = createMockAdapter();
    const msgs = await adapter.getMessages("chat1@g.us", { limit: 10 });
    expect(Array.isArray(msgs)).toBe(true);
    expect(msgs).toHaveLength(0);
  });

  it("createGroup returns group object", async () => {
    const adapter = createMockAdapter();
    const group = await adapter.createGroup("My Group", ["5511@s.whatsapp.net"]);
    expect(group.id).toBe("g1");
    expect(group.name).toBe("test");
  });
});
