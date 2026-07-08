#!/usr/bin/env node
// Assistente de Infraestrutura de TI — baita.ac
// Painel web (login Google restrito a @baita.ac) + API que recebe métricas
// de rede doméstica dos agentes de monitoramento, classifica a qualidade
// para videoconferência e expõe status/alertas/histórico ao time.
import express from "express";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getDb } from "./db.js";
import { requirePageAuth, ALLOWED_DOMAIN } from "./auth.js";
import { authRouter } from "./routes/auth.js";
import { apiRouter } from "./routes/api.js";
import { speedtestRouter } from "./routes/speedtest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "..", "public", "it-assistant");
const PORT = Number(process.env.IT_ASSISTANT_PORT ?? 4200);

function requireEnv(): void {
  const missing = ["GOOGLE_CLIENT_ID", "SESSION_SECRET"].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(
      `[it-assistant] Variáveis de ambiente ausentes: ${missing.join(", ")}. ` +
        "Configure-as (ver .env.example) antes de iniciar o servidor.",
    );
    process.exit(1);
  }
}

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cookieParser());

  // Rotas de speedtest usam express.raw() no próprio router — registre antes
  // do json() global para não conflitar no parsing do corpo.
  app.use(speedtestRouter);

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  app.use(authRouter);
  app.use(apiRouter);

  app.get("/login", (_req, res) => {
    res.sendFile(join(PUBLIC_DIR, "login.html"));
  });

  app.get("/config.js", (_req, res) => {
    res.type("application/javascript").send(
      `window.IT_ASSISTANT_CONFIG = ${JSON.stringify({
        googleClientId: process.env.GOOGLE_CLIENT_ID,
        allowedDomain: ALLOWED_DOMAIN,
      })};`,
    );
  });

  app.get("/", requirePageAuth, (_req, res) => {
    res.sendFile(join(PUBLIC_DIR, "index.html"));
  });

  app.get("/guia", requirePageAuth, (_req, res) => {
    res.sendFile(join(PUBLIC_DIR, "guia.html"));
  });

  app.use(express.static(PUBLIC_DIR));

  app.use((_req, res) => {
    res.status(404).json({ error: "Não encontrado." });
  });

  return app;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  requireEnv();
  getDb(); // garante schema criado antes de aceitar tráfego
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[it-assistant] Painel disponível em http://localhost:${PORT}`);
    console.log(`[it-assistant] Login restrito a contas @${ALLOWED_DOMAIN}`);
  });
}
