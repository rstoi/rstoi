import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhatsAppAdapter } from "../adapters/base.js";

export function registerTemplateTools(server: McpServer, adapter: WhatsAppAdapter): void {
  if (!adapter.listTemplates) return;

  server.tool(
    "list_templates",
    "List approved WhatsApp message templates (Cloud API only)",
    {},
    async () => {
      const templates = await adapter.listTemplates!();
      return { content: [{ type: "text" as const, text: JSON.stringify(templates) }] };
    },
  );

  server.tool(
    "send_template",
    "Send an approved WhatsApp template message (Cloud API only)",
    {
      to: z.string().describe("Recipient phone number or JID"),
      template_name: z.string().describe("Approved template name"),
      language: z.string().default("pt_BR").describe("Template language code"),
      components: z.array(z.unknown()).optional().describe("Template component variables"),
    },
    async ({ to, template_name, language, components }) => {
      const result = await adapter.sendMessage(to, {
        templateName: template_name,
        templateLanguage: language,
        templateComponents: components,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  );
}
