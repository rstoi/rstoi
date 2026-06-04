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
  } else {
    const { HttpClient } = await import("./adapters/http/index.js");
    adapter = new HttpClient();
  }

  console.error(`[WhatsApp MCP] Starting with adapter: ${config.adapter}`);
  await adapter.connect();
  await startServer(adapter);
}

main().catch((err: unknown) => {
  console.error("[Fatal]", err);
  process.exit(1);
});
