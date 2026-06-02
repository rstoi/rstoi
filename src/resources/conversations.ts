import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhatsAppAdapter } from "../adapters/base.js";

export function registerConversationResources(server: McpServer, adapter: WhatsAppAdapter): void {
  server.resource(
    "conversations",
    "whatsapp://conversations",
    { description: "List of all active WhatsApp conversations", mimeType: "application/json" },
    async () => {
      const chats = await adapter.listChats();
      return {
        contents: [{
          uri: "whatsapp://conversations",
          mimeType: "application/json",
          text: JSON.stringify(chats),
        }],
      };
    },
  );

  server.resource(
    "conversation",
    "whatsapp://conversation/{chatId}",
    { description: "Messages in a specific conversation", mimeType: "application/json" },
    async (uri) => {
      const parts = uri.href.split("/");
      const chatId = decodeURIComponent(parts[parts.length - 1]!);
      const messages = await adapter.getMessages(chatId, { limit: 100 });
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({ chatId, messages }),
        }],
      };
    },
  );
}
