import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
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
    new ResourceTemplate("whatsapp://group/{groupId}", { list: undefined }),
    { description: "Details and member list of a specific group", mimeType: "application/json" },
    async (uri, { groupId }) => {
      const id = decodeURIComponent(groupId as string);
      const group = await adapter.getGroup(id);
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
