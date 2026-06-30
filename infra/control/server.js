// Serviço de controle da Claude Workstation.
// Atrás do IAP (login @baita.ac já garantido). Responsabilidades:
//   GET /         -> landing: status da VM + botão "Acordar" + atalhos
//   GET /status   -> JSON { status } da instância
//   POST /wake    -> liga a VM (auto-start) se estiver parada
// Quando a VM está RUNNING, a landing redireciona para o app (code-server).
// A lógica pura (landing/rotas) vive em app.js para ser testável.
import http from "node:http";
import { GoogleAuth } from "google-auth-library";
import { makeHandler } from "./app.js";

const PROJECT = process.env.GCP_PROJECT;
const ZONE = process.env.GCP_ZONE;
const INSTANCE = process.env.INSTANCE_NAME;
const APP_URL = process.env.APP_URL;
const PORT = process.env.PORT || 8080;

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

const BASE = `https://compute.googleapis.com/compute/v1/projects/${PROJECT}/zones/${ZONE}/instances/${INSTANCE}`;

async function api(method, suffix = "") {
  const client = await auth.getClient();
  const res = await client.request({ url: `${BASE}${suffix}`, method });
  return res.data;
}

async function getStatus() {
  const data = await api("GET");
  return data.status; // RUNNING | TERMINATED | STOPPING | STAGING | PROVISIONING
}

async function wake() {
  const status = await getStatus();
  if (status === "TERMINATED" || status === "STOPPED") {
    await api("POST", "/start");
    return "STARTING";
  }
  return status;
}

http
  .createServer(makeHandler({ getStatus, wake, appUrl: APP_URL }))
  .listen(PORT, () => console.log(`claude-control on :${PORT}`));
