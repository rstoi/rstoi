import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhatsAppAdapter } from "../adapters/base.js";

export function registerContactTools(server: McpServer, adapter: WhatsAppAdapter): void {
  server.tool(
    "list_contacts",
    "List all WhatsApp contacts",
    {
      limit: z.number().int().default(100),
    },
    async ({ limit }) => {
      const contacts = await adapter.listContacts();
      return { content: [{ type: "text" as const, text: JSON.stringify(contacts.slice(0, limit)) }] };
    },
  );

  server.tool(
    "get_contact",
    "Get information about a specific contact",
    {
      contact_id: z.string().describe("Phone number or JID"),
    },
    async ({ contact_id }) => {
      const contact = await adapter.getContact(contact_id);
      if (!contact) throw new Error(`Contact ${contact_id} not found`);
      return { content: [{ type: "text" as const, text: JSON.stringify(contact) }] };
    },
  );

  server.tool(
    "block_contact",
    "Block a contact",
    {
      contact_id: z.string().describe("Phone number or JID"),
    },
    async ({ contact_id }) => {
      await adapter.blockContact(contact_id);
      return { content: [{ type: "text" as const, text: `Contact ${contact_id} blocked` }] };
    },
  );

  server.tool(
    "unblock_contact",
    "Unblock a previously blocked contact",
    {
      contact_id: z.string().describe("Phone number or JID"),
    },
    async ({ contact_id }) => {
      await adapter.unblockContact(contact_id);
      return { content: [{ type: "text" as const, text: `Contact ${contact_id} unblocked` }] };
    },
  );
}
