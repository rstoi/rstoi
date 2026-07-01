import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";

const silentLogger = { level:"silent", trace:()=>{}, debug:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{}, fatal:()=>{}, child(){ return silentLogger; } };

const PHONE = process.argv[2];
if (!PHONE) { process.stderr.write("Usage: node pair-code.mjs <phone>\n"); process.exit(1); }

const { state, saveCreds } = await useMultiFileAuthState("data/wa-session");
const sock = makeWASocket({
  auth: state,
  logger: silentLogger,
  printQRInTerminal: false,
});

let codeSent = false;
sock.ev.on("connection.update", async ({ connection, qr }) => {
  if (connection === "open") {
    process.stderr.write("✓ CONECTADO!\n");
    process.exit(0);
  }
  if (qr && !codeSent) {
    codeSent = true;
    try {
      const code = await sock.requestPairingCode(PHONE);
      process.stderr.write("\n╔══════════════════════╗\n");
      process.stderr.write(`║  CÓDIGO: ${code}  ║\n`);
      process.stderr.write("╚══════════════════════╝\n");
      process.stderr.write("\nWhatsApp → Aparelhos conectados → Conectar com número de telefone\n");
      process.stderr.write("Digite o código acima. Válido por 2 minutos.\n\n");
    } catch (e) {
      process.stderr.write("Erro: " + e.message + "\n");
    }
  }
});
sock.ev.on("creds.update", saveCreds);

setTimeout(() => {}, 120000);
