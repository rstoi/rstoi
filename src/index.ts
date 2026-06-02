#!/usr/bin/env node
import "./config.js";
import { config } from "./config.js";
import { getDb } from "./store/db.js";
import { startServer } from "./server.js";

async function main(): Promise<void> {
  // Initialize SQLite database and schema
  getDb();

  let adapter;
  if (config.adapter === "cloud-api") {
    const { CloudApiClient } = await import("./adapters/cloud-api/index.js");
    adapter = new CloudApiClient();
  } else if (config.adapter === "twilio") {
    const { TwilioClient } = await import("./adapters/twilio/index.js");
    adapter = new TwilioClient();
  } else {
    const { BaileysClient } = await import("./adapters/baileys/index.js");
    adapter = new BaileysClient();
  }

  console.error(`[WhatsApp MCP] Starting with adapter: ${config.adapter}`);

  await adapter.connect();
  await startServer(adapter);
}

main().catch((err: unknown) => {
  console.error("[Fatal]", err);
  process.exit(1);
});
