import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";

const silentLogger = { level:"silent", trace:()=>{}, debug:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{}, fatal:()=>{}, child(){ return silentLogger; } };

const PHONE = process.argv[2];
if (!PHONE) { console.error("Usage: node pair-code.mjs <phone>"); process.exit(1); }

const { state, saveCreds } = await useMultiFileAuthState("data/wa-session");
const sock = makeWASocket({
  auth: state,
  logger: silentLogger,
  printQRInTerminal: false,
  mobile: false,
});

sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
  if (connection === "open") {
    console.log("✓ CONECTADO!");
    process.exit(0);
  }
  if (qr) {
    // request pairing code instead of QR
    try {
      const code = await sock.requestPairingCode(PHONE);
      console.log("\n╔══════════════════════╗");
      console.log(`║  CÓDIGO: ${code}  ║`);
      console.log("╚══════════════════════╝");
      console.log("\nWhatsApp → Aparelhos conectados → Conectar com número de telefone");
      console.log("Digite o código acima. Válido por 2 minutos.\n");
    } catch (e) {
      console.error("Erro ao solicitar código:", e.message);
    }
  }
});
sock.ev.on("creds.update", saveCreds);

// keep alive
setTimeout(() => {}, 120000);
