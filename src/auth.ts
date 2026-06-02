#!/usr/bin/env node
/**
 * Standalone auth — conecta ao WhatsApp via Baileys e exibe o QR code.
 * Execute uma vez para vincular sua conta. As credenciais são salvas em data/session/.
 */
import "./config.js";
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import pino from "pino";
import { mkdir } from "fs/promises";

const sessionPath = process.env.WA_SESSION_PATH ?? "./data/session";
await mkdir(sessionPath, { recursive: true });

// Nível "warn" para ver erros do Baileys sem flood de debug
const logger = pino({ level: "warn" });

const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
const { version } = await fetchLatestBaileysVersion();
console.log(`[auth] Baileys ${version.join(".")} — aguardando QR code...`);

const sock = makeWASocket({
  version,
  logger,
  auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(state.keys, logger),
  },
  generateHighQualityLinkPreview: false,
  connectTimeoutMs: 30_000,
  keepAliveIntervalMs: 10_000,
  retryRequestDelayMs: 250,
});

sock.ev.on("creds.update", saveCreds);

await new Promise<void>((resolve) => {
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr, isOnline } = update;
    console.log("[auth] connection.update:", JSON.stringify({ connection, isOnline, hasQR: !!qr }));

    if (qr) {
      console.log("\n=== Escaneie com WhatsApp > Dispositivos Conectados > Conectar dispositivo ===\n");
      qrcode.generate(qr, { small: true });
      console.log("\n=================================================================================\n");
    }

    if (connection === "close") {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      console.log(`[auth] Conexão encerrada — código: ${code}`);
      if (code === DisconnectReason.loggedOut) {
        console.log("[auth] Deslogado. Delete data/session/ e tente novamente.");
      }
      resolve();
    }

    if (connection === "open") {
      console.log("\n[auth] ✓ Autenticado! Sessão salva em:", sessionPath);
      console.log("[auth] Agora execute: npm run dev\n");
      setTimeout(() => { sock.end(undefined); resolve(); }, 2000);
    }
  });

  setTimeout(() => {
    console.log("[auth] Timeout de 90s.");
    sock.end(undefined);
    resolve();
  }, 90_000);
});

process.exit(0);
