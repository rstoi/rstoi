import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhatsAppAdapter } from "../adapters/base.js";

export function registerGroupResources(server: McpServer, adapter: WhatsAppAdapter): void {
  server.resource(
    "groups",
    "whatsapp://groups",
    { description: "All WhatsApp groups the account participates in", mimeType: "application/json" },
    async () => {
      const groups = await adapter.listGroups();
      return {
        contents: [{
          uri: "whatsapp://groups",
          mimeType: "application/json",
          text: JSON.stringify(groups),
        }],
      };
    },
  );

  server.resource(
    "group",
    "whatsapp://group/{groupId}",
    { description: "Details and member list of a specific group", mimeType: "application/json" },
    async (uri) => {
      const parts = uri.href.split("/");
      const groupId = decodeURIComponent(parts[parts.length - 1]!);
      const group = await adapter.getGroup(groupId);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(group),
        }],
      };
    },
  );
}
