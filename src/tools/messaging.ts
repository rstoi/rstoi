import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhatsAppAdapter } from "../adapters/base.js";
import { getDb } from "../store/db.js";

export function registerMessagingTools(server: McpServer, adapter: WhatsAppAdapter): void {
  server.tool(
    "send_message",
    "Send a text or media message to a contact or group",
    {
      to: z.string().describe("Phone number (e.g. 5511999990000) or group JID (e.g. 120363xxx@g.us)"),
      text: z.string().optional().describe("Text content of the message"),
      media_url: z.string().url().optional().describe("URL of media to send"),
      media_type: z.enum(["image", "video", "audio", "document"]).optional(),
      caption: z.string().optional().describe("Caption for media messages"),
      file_name: z.string().optional().describe("Filename for document messages"),
      quoted_message_id: z.string().optional().describe("ID of message to reply to (quoted)"),
    },
    async ({ to, text, media_url, media_type, caption, file_name, quoted_message_id }) => {
      const result = await adapter.sendMessage(to, {
        text,
        mediaUrl: media_url,
        mediaType: media_type,
        caption,
        fileName: file_name,
        quotedMessageId: quoted_message_id,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "reply_message",
    "Reply to a specific message (quoted reply)",
    {
      to: z.string().describe("Chat or group JID"),
      quoted_message_id: z.string().describe("ID of the message to reply to"),
      text: z.string().describe("Reply text"),
    },
    async ({ to, quoted_message_id, text }) => {
      const result = await adapter.sendMessage(to, { text, quotedMessageId: quoted_message_id });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "edit_message",
    "Edit the text of a sent message",
    {
      message_id: z.string().describe("ID of the message to edit"),
      chat_id: z.string().describe("Chat or group JID where the message is"),
      new_text: z.string().describe("New text content"),
    },
    async ({ message_id, chat_id, new_text }) => {
      await adapter.editMessage(message_id, chat_id, new_text);
      return { content: [{ type: "text" as const, text: "Message edited successfully" }] };
    },
  );

  server.tool(
    "delete_message",
    "Delete a message (for everyone or just for me)",
    {
      message_id: z.string().describe("ID of the message to delete"),
      chat_id: z.string().describe("Chat or group JID"),
      for_everyone: z.boolean().default(true).describe("Delete for all participants"),
    },
    async ({ message_id, chat_id, for_everyone }) => {
      await adapter.deleteMessage(message_id, chat_id, for_everyone);
      return { content: [{ type: "text" as const, text: "Message deleted" }] };
    },
  );

  server.tool(
    "react_to_message",
    "React to a message with an emoji",
    {
      message_id: z.string().describe("ID of the message to react to"),
      chat_id: z.string().describe("Chat or group JID"),
      emoji: z.string().describe("Emoji to react with (e.g. '👍', '❤️', '' to remove)"),
    },
    async ({ message_id, chat_id, emoji }) => {
      await adapter.reactToMessage(message_id, chat_id, emoji);
      return { content: [{ type: "text" as const, text: "Reaction sent" }] };
    },
  );

  server.tool(
    "forward_message",
    "Forward a message to another chat",
    {
      message_id: z.string().describe("ID of the message to forward"),
      to: z.string().describe("Destination chat or group JID"),
    },
    async ({ message_id, to }) => {
      const msg = await adapter.getMessage(message_id);
      if (!msg) throw new Error(`Message ${message_id} not found`);
      const result = await adapter.sendMessage(to, {
        text: msg.text ? `[forwarded] ${msg.text}` : "[forwarded media]",
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "mark_as_read",
    "Mark messages in a chat as read",
    {
      chat_id: z.string().describe("Chat or group JID"),
    },
    async ({ chat_id }) => {
      await adapter.markAsRead(chat_id);
      return { content: [{ type: "text" as const, text: "Marked as read" }] };
    },
  );

  server.tool(
    "get_messages",
    "Get message history from a chat or group",
    {
      chat_id: z.string().describe("Chat or group JID"),
      limit: z.number().int().min(1).max(200).default(50).describe("Number of messages to return"),
      before: z.number().optional().describe("Unix ms timestamp — fetch messages before this time"),
      after: z.number().optional().describe("Unix ms timestamp — fetch messages after this time"),
    },
    async ({ chat_id, limit, before, after }) => {
      const messages = await adapter.getMessages(chat_id, { limit, before, after });
      return { content: [{ type: "text" as const, text: JSON.stringify(messages) }] };
    },
  );

  server.tool(
    "get_message",
    "Get a specific message by ID",
    {
      message_id: z.string().describe("Message ID"),
    },
    async ({ message_id }) => {
      const message = await adapter.getMessage(message_id);
      if (!message) throw new Error(`Message ${message_id} not found`);
      return { content: [{ type: "text" as const, text: JSON.stringify(message) }] };
    },
  );

  server.tool(
    "search_messages",
    "Full-text search across all stored messages",
    {
      query: z.string().describe("Search query"),
      chat_id: z.string().optional().describe("Limit search to a specific chat"),
      limit: z.number().int().default(20),
    },
    async ({ query, chat_id, limit }) => {
      const db = getDb();
      const rows = chat_id
        ? db.prepare(`
            SELECT m.* FROM messages m
            JOIN messages_fts ON messages_fts.id = m.id
            WHERE messages_fts MATCH ? AND m.chat_id = ?
            ORDER BY m.timestamp DESC LIMIT ?
          `).all(query, chat_id, limit)
        : db.prepare(`
            SELECT m.* FROM messages m
            JOIN messages_fts ON messages_fts.id = m.id
            WHERE messages_fts MATCH ?
            ORDER BY m.timestamp DESC LIMIT ?
          `).all(query, limit);
      return { content: [{ type: "text" as const, text: JSON.stringify(rows) }] };
    },
  );

  server.tool(
    "list_conversations",
    "List all active conversations (chats and groups)",
    {
      limit: z.number().int().default(50).describe("Max conversations to return"),
    },
    async ({ limit }) => {
      const chats = await adapter.listChats();
      return { content: [{ type: "text" as const, text: JSON.stringify(chats.slice(0, limit)) }] };
    },
  );
}
