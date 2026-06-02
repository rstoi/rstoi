import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhatsAppAdapter } from "../adapters/base.js";

export function registerContactResources(server: McpServer, adapter: WhatsAppAdapter): void {
  server.resource(
    "contacts",
    "whatsapp://contacts",
    { description: "All WhatsApp contacts", mimeType: "application/json" },
    async () => {
      const contacts = await adapter.listContacts();
      return {
        contents: [{
          uri: "whatsapp://contacts",
          mimeType: "application/json",
          text: JSON.stringify(contacts),
        }],
      };
    },
  );

  server.resource(
    "contact",
    new ResourceTemplate("whatsapp://contact/{contactId}", { list: undefined }),
    { description: "Details of a specific contact", mimeType: "application/json" },
    async (uri, { contactId }) => {
      const id = decodeURIComponent(contactId as string);
      const contact = await adapter.getContact(id);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(contact),
        }],
      };
    },
  );
}
