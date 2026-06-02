import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhatsAppAdapter } from "../adapters/base.js";
import { registerMessagingTools } from "./messaging.js";
import { registerGroupTools } from "./groups.js";
import { registerContactTools } from "./contacts.js";
import { registerMediaTools } from "./media.js";
import { registerTemplateTools } from "./templates.js";

export function registerAllTools(server: McpServer, adapter: WhatsAppAdapter): void {
  registerMessagingTools(server, adapter);
  registerGroupTools(server, adapter);
  registerContactTools(server, adapter);
  registerMediaTools(server, adapter);
  registerTemplateTools(server, adapter);
}
