import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";

const silentLogger = { level:"silent", trace:()=>{}, debug:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{}, fatal:()=>{}, child(){ return silentLogger; } };

const GROUPS = ["120363429059782436@g.us", "120363430150734776@g.us"];
const found = {};

const { state, saveCreds } = await useMultiFileAuthState("data/wa-session");
const sock = makeWASocket({ auth: state, logger: silentLogger, printQRInTerminal: false });
sock.ev.on("creds.update", saveCreds);

sock.ev.on("messaging-history.set", ({ messages }) => {
  for (const m of messages) {
    if (GROUPS.includes(m.key?.remoteJid)) {
      if (!found[m.key.remoteJid]) found[m.key.remoteJid] = [];
      found[m.key.remoteJid].push(m);
    }
  }
});

sock.ev.on("messages.upsert", ({ messages }) => {
  for (const m of messages) {
    if (GROUPS.includes(m.key?.remoteJid)) {
      if (!found[m.key.remoteJid]) found[m.key.remoteJid] = [];
      found[m.key.remoteJid].push(m);
    }
  }
});

sock.ev.on("connection.update", async ({ connection }) => {
  if (connection === "close") { process.stderr.write("closed\n"); process.exit(1); }
  if (connection === "open") {
    process.stderr.write("Connected — aguardando sync...\n");
    // Wait for history sync
    await new Promise(r => setTimeout(r, 20000));
    const labels = { "120363429059782436@g.us": "Baita Financeiro", "120363430150734776@g.us": "Baita TI" };
    for (const jid of GROUPS) {
      process.stderr.write(`\n══ ${labels[jid]} ══\n`);
      const msgs = (found[jid] || []).sort((a,b) => Number(a.messageTimestamp)-Number(b.messageTimestamp)).slice(-15);
      if (!msgs.length) { process.stderr.write("(nenhuma mensagem recebida no sync)\n"); continue; }
      for (const m of msgs) {
        const ts = new Date(Number(m.messageTimestamp)*1000).toLocaleString("pt-BR");
        const sender = m.pushName || m.key?.participant?.split("@")[0] || "?";
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.message?.imageMessage?.caption || "[mídia]";
        process.stderr.write(`[${ts}] ${sender}: ${text}\n`);
      }
    }
    process.exit(0);
  }
});

setTimeout(() => { process.stderr.write("timeout\n"); process.exit(1); }, 60000);
