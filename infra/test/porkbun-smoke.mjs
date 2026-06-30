// Smoke do porkbun-dns.sh contra um mock da API do Porkbun.
// Sobe um servidor que imita /ping, /dns/deleteByNameType e /dns/create,
// roda o script com PORKBUN_API apontando para o mock e valida que os
// registros A corretos (app/claude -> IP) foram criados.
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = resolve(__dirname, "../..");
let pass = 0, fail = 0;
const ok = (m) => { console.log("PASS -", m); pass++; };
const no = (m) => { console.log("FAIL -", m); fail++; };

const created = [];
const deleted = [];
let pinged = false;

const server = http.createServer((req, res) => {
  let buf = "";
  req.on("data", (c) => (buf += c));
  req.on("end", () => {
    const url = req.url;
    let body = {};
    try { body = JSON.parse(buf || "{}"); } catch {}
    // valida credenciais presentes em todo request
    const auth = body.apikey === "pk_test" && body.secretapikey === "sk_test";
    if (url === "/ping") { pinged = true; return json(res, { status: auth ? "SUCCESS" : "ERROR", yourIp: "1.2.3.4" }); }
    const del = url.match(/^\/dns\/deleteByNameType\/([^/]+)\/A\/(.+)$/);
    if (del) { deleted.push(del[2]); return json(res, { status: "SUCCESS" }); }
    const cre = url.match(/^\/dns\/create\/(.+)$/);
    if (cre) {
      if (body.type === "A") created.push({ domain: cre[1], name: body.name, content: body.content, ttl: body.ttl });
      return json(res, { status: "SUCCESS", id: created.length });
    }
    json(res, { status: "ERROR", message: "rota desconhecida: " + url }, 404);
  });
});
function json(res, obj, code = 200) { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); }

await new Promise((r) => server.listen(0, r));
const api = `http://127.0.0.1:${server.address().port}`;

const child = spawn("bash", [resolve(repo, "infra/scripts/porkbun-dns.sh")], {
  env: {
    ...process.env,
    PORKBUN_API: api,
    PORKBUN_API_KEY: "pk_test",
    PORKBUN_SECRET_API_KEY: "sk_test",
    DOMAIN: "baita.one",
    SUBS: "app claude",
    IP: "34.120.0.55", // pula o terraform
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let out = "";
child.stdout.on("data", (d) => (out += d));
child.stderr.on("data", (d) => (out += d));
const rc = await new Promise((r) => child.on("close", r));

try {
  rc === 0 ? ok("porkbun-dns.sh saiu 0") : no(`porkbun-dns.sh saiu ${rc}\n${out}`);
  pinged ? ok("validou credenciais via /ping") : no("não chamou /ping");
  // deve apagar antes de criar (idempotência)
  (deleted.includes("app") && deleted.includes("claude"))
    ? ok("deleteByNameType para app e claude (idempotência)") : no(`delete faltando: ${JSON.stringify(deleted)}`);
  const appRec = created.find((r) => r.name === "app");
  const clRec = created.find((r) => r.name === "claude");
  (appRec && appRec.content === "34.120.0.55" && appRec.domain === "baita.one")
    ? ok(`criou A app.baita.one -> ${appRec.content}`) : no(`registro app errado: ${JSON.stringify(appRec)}`);
  (clRec && clRec.content === "34.120.0.55")
    ? ok(`criou A claude.baita.one -> ${clRec.content}`) : no(`registro claude errado: ${JSON.stringify(clRec)}`);

  console.log(`\n=== porkbun: ${pass} PASS / ${fail} FAIL ===`);
} finally {
  server.close();
}
process.exit(fail);
