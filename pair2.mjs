import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";

const silentLogger = { level:"silent", trace:()=>{}, debug:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{}, fatal:()=>{}, child(){ return silentLogger; } };

process.stderr.write("Starting...\n");

const { state, saveCreds } = await useMultiFileAuthState("data/wa-session");
process.stderr.write("State loaded, registered: " + state.creds.registered + "\n");

const sock = makeWASocket({ auth: state, logger: silentLogger, printQRInTerminal: false });

sock.ev.on("connection.update", async (update) => {
  process.stderr.write("update: " + JSON.stringify(update).slice(0,200) + "\n");
  const { connection, qr } = update;
  if (qr) {
    process.stderr.write("Got QR, requesting pairing code...\n");
    try {
      const code = await sock.requestPairingCode("5519997611998");
      process.stderr.write("CODE: " + code + "\n");
    } catch(e) {
      process.stderr.write("Error: " + e.message + "\n");
    }
  }
  if (connection === "open") {
    process.stderr.write("CONNECTED!\n");
    process.exit(0);
  }
});

sock.ev.on("creds.update", saveCreds);
setTimeout(() => process.exit(1), 30000);
