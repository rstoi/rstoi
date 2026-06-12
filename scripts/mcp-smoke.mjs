// Teste funcional (smoke) do servidor MCP de WhatsApp, ponta a ponta, via
// protocolo MCP (stdio, JSON-RPC newline-delimited). Usa o adaptador `http` em
// modo local-only — não envia nada para o WhatsApp real; valida o pipeline
// tool -> adaptador -> store -> leitura e o guardrail WA_BLOCKED_GROUPS.
//
//   node scripts/mcp-smoke.mjs   (sai 0 se passar, 1 se falhar)
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const env = {
  ...process.env,
  WA_ADAPTER: "http",
  SQLITE_DB_PATH: join(tmpdir(), `wa-smoke-${Date.now()}.db`),
  MCP_TRANSPORT: "stdio",
  WEBHOOK_PORT: "3999",
  WA_BLOCKED_GROUPS: "financasfacil",
  WA_HTTP_PHONE: "5511970000000", // "eu mesmo"
};

const child = spawn("node_modules/.bin/tsx", ["src/index.ts"], {
  cwd: "/home/user/rstoi",
  env,
  stdio: ["pipe", "pipe", "pipe"],
});

const pending = new Map();
let buf = "";
child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});
child.stderr.on("data", (d) => process.stderr.write(d)); // logs do servidor

let idc = 0;
function rpc(method, params) {
  const id = ++idc;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}
const text = (r) => r?.result?.content?.[0]?.text ?? JSON.stringify(r?.error ?? r);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(2500); // deixa o servidor subir
  await rpc("initialize", {
    protocolVersion: "2024-11-05", capabilities: {},
    clientInfo: { name: "wa-test", version: "0" },
  });
  notify("notifications/initialized");

  const ME = "5511970000000";
  const MSG = "✅ Mensagem de teste do MCP WhatsApp — setup.com.br (" + new Date().toISOString() + ")";

  console.log("\n=== 1) send_message (para mim mesmo) ===");
  const s = await rpc("tools/call", { name: "send_message", arguments: { to: ME, text: MSG } });
  console.log(text(s));

  console.log("\n=== 2) get_messages (lê de volta) ===");
  const g = await rpc("tools/call", { name: "get_messages", arguments: { chat_id: ME, limit: 5 } });
  const gt = text(g);
  console.log(gt.slice(0, 600));
  const roundtrip = gt.includes("Mensagem de teste do MCP");
  console.log("ROUND-TRIP:", roundtrip ? "OK ✅" : "FALHOU ❌");

  console.log("\n=== 3) list_conversations ===");
  console.log(text(await rpc("tools/call", { name: "list_conversations", arguments: {} })).slice(0, 400));

  console.log("\n=== 4) guardrail: enviar para 'financasfacil' (deve bloquear) ===");
  const b = await rpc("tools/call", { name: "send_message", arguments: { to: "financasfacil", text: "nao deveria ir" } });
  const bt = text(b);
  console.log(bt.slice(0, 300));
  const blocked = /bloquead|blocked/i.test(bt);
  console.log("GUARDRAIL:", blocked ? "BLOQUEADO ✅" : "NÃO BLOQUEOU ❌");

  const ok = roundtrip && blocked;
  console.log(`\n=== RESULTADO: ${ok ? "PASSOU ✅" : "FALHOU ❌"} ===`);
  await sleep(300);
  child.kill("SIGTERM");
  process.exit(ok ? 0 : 1);
})();
