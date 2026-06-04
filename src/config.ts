import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// Load .env from project root if present (no dotenv dependency)
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

export const config = {
  adapter: (process.env.WA_ADAPTER ?? "http") as "cloud-api" | "http" | "playwright",
  webhookPort: parseInt(process.env.WEBHOOK_PORT ?? "3000", 10),
  mcpTransport: (process.env.MCP_TRANSPORT ?? "stdio") as "stdio" | "http",
  logLevel: process.env.LOG_LEVEL ?? "info",
  dbPath: process.env.SQLITE_DB_PATH ?? "./data/whatsapp.db",
};
