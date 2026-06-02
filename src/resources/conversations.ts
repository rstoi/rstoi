import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
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
    new ResourceTemplate("whatsapp://conversation/{chatId}", { list: undefined }),
    { description: "Messages in a specific conversation", mimeType: "application/json" },
    async (uri, { chatId }) => {
      const id = decodeURIComponent(chatId as string);
      const messages = await adapter.getMessages(id, { limit: 100 });
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({ chatId: id, messages }),
        }],
      };
    },
  );
}
