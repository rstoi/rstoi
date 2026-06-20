// Gateway do setupOS Cloud (Cloud Run).
// - HTTP: health check.
// - WS /pty: terminal/Claude CLI, autenticado por ID token + domínio setup.com.br.
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { verify, requireOperator } from "./auth.js";
import { attachPty } from "./pty.js";
import { CONNECTORS, summarize } from "./connectors.js";

const PORT = Number(process.env.PORT ?? 8080);
const CORS = {
  "access-control-allow-origin": process.env.ALLOWED_ORIGIN ?? "*",
  "access-control-allow-headers": "authorization,content-type",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "", "http://localhost");

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (url.pathname === "/" || url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json", ...CORS });
    res.end(JSON.stringify({ ok: true, service: "setupos-gateway" }));
    return;
  }

  // Catálogo de conectores + saúde — autenticado (qualquer conta @setup.com.br).
  if (url.pathname === "/connectors") {
    const token = url.searchParams.get("token") ?? "";
    try {
      await verify(token);
    } catch (e) {
      res.writeHead(401, { "content-type": "application/json", ...CORS });
      res.end(JSON.stringify({ error: (e as Error).message }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json", ...CORS });
    res.end(JSON.stringify({ connectors: CONNECTORS, summary: summarize() }));
    return;
  }

  res.writeHead(404, CORS);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", async (req, socket, head) => {
  const url = new URL(req.url ?? "", "http://localhost");
  if (url.pathname !== "/pty") {
    socket.destroy();
    return;
  }

  const token = url.searchParams.get("token") ?? "";
  const kind = url.searchParams.get("kind") === "claude" ? "claude" : "terminal";

  let principal;
  try {
    principal = await verify(token);
    // Terminal e Claude CLI são sessões sensíveis: exigem papel de operador.
    requireOperator(principal);
  } catch (e) {
    // 4401: política de autenticação/autorização (close code de aplicação).
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.send(`\r\n\x1b[31m${(e as Error).message}\x1b[0m\r\n`);
      ws.close(4401);
    });
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    attachPty(ws, kind, principal.email);
  });
});

server.listen(PORT, () => {
  console.log(`[setupos-gateway] ouvindo em :${PORT}`);
});
