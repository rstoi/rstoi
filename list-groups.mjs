import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";

const silentLogger = { level:"silent", trace:()=>{}, debug:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{}, fatal:()=>{}, child(){ return silentLogger; } };

const { state, saveCreds } = await useMultiFileAuthState("data/wa-session");
const sock = makeWASocket({ auth: state, logger: silentLogger, printQRInTerminal: false });

sock.ev.on("creds.update", saveCreds);
sock.ev.on("connection.update", async ({ connection }) => {
  if (connection === "open") {
    process.stderr.write("Connected, fetching groups...\n");
    await new Promise(r => setTimeout(r, 3000));
    const chats = await sock.groupFetchAllParticipating();
    const groups = Object.values(chats);
    const baita = groups.filter(g => g.subject.toLowerCase().includes("baita") || g.subject.toLowerCase().includes("financ") || g.subject.toLowerCase().includes("ti ") || g.subject.toLowerCase().includes(" ti"));
    process.stderr.write("Total groups: " + groups.length + "\n");
    process.stderr.write("Baita groups:\n");
    baita.forEach(g => process.stderr.write(`  - ${g.subject} (${g.id})\n`));
    if (!baita.length) {
      process.stderr.write("Nenhum grupo 'baita' encontrado. Todos os grupos:\n");
      groups.slice(0,20).forEach(g => process.stderr.write(`  - ${g.subject}\n`));
    }
    process.exit(0);
  }
  if (connection === "close") {
    process.stderr.write("Connection closed\n");
    process.exit(1);
  }
});

setTimeout(() => { process.stderr.write("timeout\n"); process.exit(1); }, 30000);
