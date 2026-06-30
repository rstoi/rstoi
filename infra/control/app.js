// Lógica pura do serviço de controle (sem dependência de GCP), para ser testável.
// server.js injeta getStatus/wake reais (Compute API); os testes injetam fakes.

export const MANIFEST = JSON.stringify({
  name: "Claude Workstation",
  short_name: "Claude",
  start_url: "/",
  display: "standalone",
  background_color: "#0b0b0f",
  theme_color: "#0b0b0f",
});

export function landing(status, appUrl) {
  const running = status === "RUNNING";
  return `<!doctype html><html lang="pt-br"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0b0b0f">
<link rel="manifest" href="/manifest.webmanifest">
<title>Claude Workstation</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#0b0b0f;color:#e8e8ea;
       display:grid;place-items:center;min-height:100vh}
  .card{max-width:420px;width:90%;text-align:center;padding:2rem}
  h1{font-size:1.4rem;margin:.2rem 0 1rem}
  .dot{display:inline-block;width:.6rem;height:.6rem;border-radius:50%;
       background:${running ? "#39d353" : "#888"};margin-right:.4rem}
  button,a.btn{display:block;width:100%;box-sizing:border-box;margin:.5rem 0;
       padding:.9rem 1rem;border:0;border-radius:.7rem;font-size:1rem;cursor:pointer;
       text-decoration:none;color:#0b0b0f;background:#e8e8ea;font-weight:600}
  a.ghost{background:transparent;color:#9aa;border:1px solid #333}
  .muted{color:#888;font-size:.85rem;margin-top:1rem}
</style></head><body>
<div class="card">
  <h1>Claude Workstation</h1>
  <p><span class="dot"></span>Estado: <strong id="st">${status}</strong></p>
  ${running
    ? `<a class="btn" href="${appUrl}">Abrir editor + terminal</a>
       <a class="btn ghost" href="${appUrl}/proxy/7681/">Só terminal</a>
       <a class="btn ghost" href="${appUrl}/proxy/6080/vnc.html">Ver o browser (noVNC)</a>`
    : `<button id="wake">Acordar estação</button>
       <p class="muted">Liga em ~20–40s; redireciono sozinho quando estiver pronta.</p>`}
</div>
<script>
async function poll(){
  const r = await fetch('/status'); const {status} = await r.json();
  document.getElementById('st').textContent = status;
  if(status==='RUNNING'){ location.href=${JSON.stringify(appUrl)}; return; }
  setTimeout(poll, 4000);
}
const b=document.getElementById('wake');
if(b){ b.onclick=async()=>{ b.disabled=true; b.textContent='Acordando…';
  await fetch('/wake',{method:'POST'}); poll(); }; }
</script>
</body></html>`;
}

// Cria o handler HTTP. deps = { getStatus(): Promise<string>, wake(): Promise<string>, appUrl }
export function makeHandler({ getStatus, wake, appUrl }) {
  return async (req, res) => {
    try {
      if (req.url === "/status") {
        const status = await getStatus();
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ status }));
      }
      if (req.url === "/wake" && req.method === "POST") {
        const status = await wake();
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ status }));
      }
      if (req.url === "/manifest.webmanifest") {
        res.writeHead(200, { "content-type": "application/manifest+json" });
        return res.end(MANIFEST);
      }
      const status = await getStatus();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(landing(status, appUrl));
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("erro: " + (e?.message || e));
    }
  };
}
