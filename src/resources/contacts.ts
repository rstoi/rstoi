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
    "whatsapp://contact/{contactId}",
    { description: "Details of a specific contact", mimeType: "application/json" },
    async (uri) => {
      const parts = uri.href.split("/");
      const contactId = decodeURIComponent(parts[parts.length - 1]!);
      const contact = await adapter.getContact(contactId);
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
