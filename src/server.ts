import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config.js";
import type { WhatsAppAdapter } from "./adapters/base.js";
import { registerAllTools } from "./tools/index.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllPrompts } from "./prompts/index.js";
import { createWebhookServer } from "./webhook.js";

export function createMcpServer(adapter: WhatsAppAdapter): McpServer {
  const server = new McpServer({
    name: "whatsapp-business-mcp",
    version: "1.0.0",
  });

  registerAllTools(server, adapter);
  registerAllResources(server, adapter);
  registerAllPrompts(server);

  return server;
}

export async function startServer(adapter: WhatsAppAdapter): Promise<void> {
  const mcpServer = createMcpServer(adapter);

  // For Cloud API, start the webhook HTTP server to receive incoming messages
  if (config.adapter === "cloud-api") {
    const app = createWebhookServer(adapter);
    const srv = app.listen(config.webhookPort, () => {
      console.error(`[Webhook] Listening on port ${config.webhookPort}`);
    });
    srv.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.error(`[Webhook] Port ${config.webhookPort} in use — webhook disabled (MCP still active)`);
      } else {
        console.error("[Webhook] Error:", err.message);
      }
    });
  }

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("[MCP] WhatsApp Business MCP server ready (stdio transport)");
}
