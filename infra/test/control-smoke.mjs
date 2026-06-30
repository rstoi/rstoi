// Smoke do serviço de controle: injeta getStatus/wake fakes, sobe o handler num
// http server e exercita /, /status, /wake, /manifest. Valida a máquina de
// estados de wake (TERMINATED -> START -> STARTING) e o redirect quando RUNNING.
import http from "node:http";
import { makeHandler, landing } from "../control/app.js";

let pass = 0, fail = 0;
const ok = (m) => { console.log("PASS -", m); pass++; };
const no = (m) => { console.log("FAIL -", m); fail++; };
const appUrl = "https://app.baita.one";

// VM fake: começa desligada; /wake liga (vira STARTING e depois RUNNING).
let state = "TERMINATED";
let started = 0;
const getStatus = async () => state;
const wake = async () => {
  if (state === "TERMINATED" || state === "STOPPED") { started++; state = "STARTING"; return "STARTING"; }
  return state;
};

const server = http.createServer(makeHandler({ getStatus, wake, appUrl }));
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

try {
  // landing com VM desligada -> mostra botão Acordar, sem link do app
  let r = await fetch(`${base}/`);
  let body = await r.text();
  r.headers.get("content-type")?.includes("text/html") ? ok("/ retorna HTML") : no("/ content-type");
  body.includes('id="wake"') && !body.includes(`<a class="btn" href="${appUrl}"`)
    ? ok("landing (desligada) mostra Acordar, sem botão do app") : no("landing desligada incorreta");

  // /status reflete o estado
  r = await fetch(`${base}/status`); let j = await r.json();
  j.status === "TERMINATED" ? ok("/status = TERMINATED") : no(`/status = ${j.status}`);

  // /manifest é PWA válido
  r = await fetch(`${base}/manifest.webmanifest`); j = await r.json();
  (r.headers.get("content-type")?.includes("manifest") && j.display === "standalone")
    ? ok("/manifest.webmanifest válido (PWA)") : no("/manifest inválido");

  // /wake (POST) liga a VM
  r = await fetch(`${base}/wake`, { method: "POST" }); j = await r.json();
  (j.status === "STARTING" && started === 1) ? ok("/wake liga a VM (STARTING)") : no(`/wake = ${j.status} started=${started}`);

  // wake idempotente: já não está TERMINATED -> não chama start de novo
  await fetch(`${base}/wake`, { method: "POST" });
  started === 1 ? ok("/wake idempotente (não re-liga STARTING)") : no(`/wake re-ligou (started=${started})`);

  // GET /wake (sem POST) cai na landing, não dispara start
  r = await fetch(`${base}/wake`); // GET
  (await r.text()).length > 0 && started === 1 ? ok("GET /wake não dispara start") : no("GET /wake disparou start");

  // landing com VM RUNNING -> mostra links do app e do noVNC
  state = "RUNNING";
  r = await fetch(`${base}/`); body = await r.text();
  (body.includes(`href="${appUrl}"`) && body.includes("/proxy/6080/vnc.html"))
    ? ok("landing (RUNNING) mostra links de app/terminal/noVNC") : no("landing RUNNING incorreta");

  // a função landing escapa o appUrl no JS de redirect (sem aspas quebradas)
  landing("RUNNING", appUrl).includes(`location.href=${JSON.stringify(appUrl)}`)
    ? ok("redirect JS usa appUrl com escape seguro") : no("redirect JS sem escape");

  console.log(`\n=== control: ${pass} PASS / ${fail} FAIL ===`);
} catch (e) {
  no("exceção: " + (e?.stack || e));
} finally {
  server.close();
}
process.exit(fail);
