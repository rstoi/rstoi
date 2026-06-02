import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhatsAppAdapter } from "../adapters/base.js";
import { registerConversationResources } from "./conversations.js";
import { registerGroupResources } from "./groups.js";
import { registerContactResources } from "./contacts.js";

export function registerAllResources(server: McpServer, adapter: WhatsAppAdapter): void {
  registerConversationResources(server, adapter);
  registerGroupResources(server, adapter);
  registerContactResources(server, adapter);
}
