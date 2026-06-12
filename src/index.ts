#!/usr/bin/env node
import "./config.js";
import { config } from "./config.js";
import { getDb } from "./store/db.js";
import { startServer } from "./server.js";

async function main(): Promise<void> {
  getDb();

  let adapter;
  if (config.adapter === "cloud-api") {
    const { CloudApiClient } = await import("./adapters/cloud-api/index.js");
    adapter = new CloudApiClient();
  } else if (config.adapter === "playwright") {
    const { PlaywrightClient } = await import("./adapters/playwright/index.js");
    adapter = new PlaywrightClient();
  } else {
    const { HttpClient } = await import("./adapters/http/index.js");
    adapter = new HttpClient();
  }

  console.error(`[WhatsApp MCP] Starting with adapter: ${config.adapter}`);

  // Sobe o servidor MCP primeiro: as ferramentas ficam disponíveis mesmo que a
  // conexão com o WhatsApp ainda não esteja pronta (login/QR ou rede). Assim o
  // MCP "ativa" sem travar caso o WhatsApp esteja inacessível.
  await startServer(adapter);

  // Conecta em background — falha/timeout não derruba o MCP; as ferramentas que
  // dependem da conexão retornam erro até o login ser concluído.
  adapter.connect().catch((err: unknown) =>
    console.error(
      "[WhatsApp MCP] Conexão pendente (login/QR ou rede):",
      err instanceof Error ? err.message : err,
    ),
  );
}

main().catch((err: unknown) => {
  console.error("[Fatal]", err);
  process.exit(1);
});
