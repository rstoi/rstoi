import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";

const silentLogger = { level:"silent", trace:()=>{}, debug:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{}, fatal:()=>{}, child(){ return silentLogger; } };

const GROUPS = { "120363429059782436@g.us": "Baita Financeiro", "120363430150734776@g.us": "Baita TI" };
const allHistory = [];

const { state, saveCreds } = await useMultiFileAuthState("data/wa-session");
const sock = makeWASocket({ auth: state, logger: silentLogger, printQRInTerminal: false, syncFullHistory: true });
sock.ev.on("creds.update", saveCreds);

sock.ev.on("messaging-history.set", ({ messages, chats }) => {
  process.stderr.write(`history.set: ${messages.length} msgs, ${chats.length} chats\n`);
  allHistory.push(...messages);
  // show any group messages
  const groupMsgs = messages.filter(m => m.key?.remoteJid?.endsWith("@g.us"));
  process.stderr.write(`  grupo msgs: ${groupMsgs.length}\n`);
  const baitaMsgs = messages.filter(m => GROUPS[m.key?.remoteJid]);
  process.stderr.write(`  baita msgs: ${baitaMsgs.length}\n`);
});

sock.ev.on("messages.upsert", ({ messages, type }) => {
  process.stderr.write(`upsert (${type}): ${messages.length}\n`);
  for (const m of messages) {
    if (GROUPS[m.key?.remoteJid]) {
      const ts = new Date(Number(m.messageTimestamp)*1000).toLocaleString("pt-BR");
      const sender = m.pushName || m.key?.participant?.split("@")[0] || "?";
      const text = m.message?.conversation || m.message?.extendedTextMessage?.text || "[mídia]";
      process.stderr.write(`[${GROUPS[m.key.remoteJid]}] [${ts}] ${sender}: ${text}\n`);
    }
  }
});

sock.ev.on("connection.update", async ({ connection }) => {
  if (connection === "open") {
    process.stderr.write("Conectado — aguardando 20s...\n");
    await new Promise(r => setTimeout(r, 20000));
    process.stderr.write(`\nTotal histórico recebido: ${allHistory.length} msgs\n`);
    // Top 5 chats with most history
    const bychat = {};
    for (const m of allHistory) { const j = m.key?.remoteJid; bychat[j] = (bychat[j]||0)+1; }
    const top = Object.entries(bychat).sort((a,b)=>b[1]-a[1]).slice(0,5);
    process.stderr.write("Top chats no histórico: " + JSON.stringify(top) + "\n");
    process.exit(0);
  }
  if (connection === "close") process.exit(1);
});

setTimeout(() => { process.stderr.write("timeout\n"); process.exit(1); }, 60000);
