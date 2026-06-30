// Smoke test do MCP computer-use: conecta no servidor (stdio), lista tools e
// exercita screenshot / get_screen_size / type_text / mouse_move contra o
// DISPLAY virtual. Exige Xvfb em :99. Sai 0 se tudo passar.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = resolve(__dirname, "../..");
let pass = 0, fail = 0;
const ok = (m) => { console.log("PASS -", m); pass++; };
const no = (m) => { console.log("FAIL -", m); fail++; };

const transport = new StdioClientTransport({
  command: resolve(repo, "node_modules/.bin/tsx"),
  args: [resolve(repo, "src/computer-use/server.ts")],
  env: { ...process.env, DISPLAY: process.env.DISPLAY || ":99" },
});
const client = new Client({ name: "smoke", version: "1.0.0" }, { capabilities: {} });

try {
  await client.connect(transport);
  ok("handshake MCP (initialize)");

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const t of ["screenshot", "get_screen_size", "type", "mouse_move", "left_click"]) {
    names.includes(t) ? ok(`tool exposta: ${t}`) : no(`tool ausente: ${t}`);
  }

  // get_screen_size
  const ss = await client.callTool({ name: "get_screen_size", arguments: {} });
  const txt = ss.content?.find((c) => c.type === "text")?.text || "";
  let size; try { size = JSON.parse(txt); } catch {}
  size && size.width > 0 && size.height > 0
    ? ok(`get_screen_size -> ${size.width}x${size.height}`)
    : no(`get_screen_size retorno inválido: ${txt}`);

  // screenshot -> imagem base64 PNG
  const shot = await client.callTool({ name: "screenshot", arguments: {} });
  const img = shot.content?.find((c) => c.type === "image");
  const isPng = img && typeof img.data === "string" &&
    Buffer.from(img.data, "base64").slice(0, 8).toString("hex") === "89504e470d0a1a0a";
  isPng ? ok(`screenshot -> PNG ${Buffer.from(img.data, "base64").length} bytes`)
        : no("screenshot não retornou PNG válido");

  // type e mouse_move (xdotool) — não devem dar isError
  const tt = await client.callTool({ name: "type", arguments: { text: "claude-ok" } });
  tt.isError ? no(`type erro: ${JSON.stringify(tt.content)}`) : ok("type executou (xdotool)");
  const mm = await client.callTool({ name: "mouse_move", arguments: { x: 200, y: 200 } });
  mm.isError ? no(`mouse_move erro: ${JSON.stringify(mm.content)}`) : ok("mouse_move executou (xdotool)");

  console.log(`\n=== computer-use: ${pass} PASS / ${fail} FAIL ===`);
} catch (e) {
  no("exceção: " + (e?.stack || e));
} finally {
  try { await client.close(); } catch {}
  try { await transport.close(); } catch {}
}
process.exit(fail);
