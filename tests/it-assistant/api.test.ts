import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";

process.env.IT_ASSISTANT_DB_PATH = ":memory:";
process.env.SESSION_SECRET = "test-secret";
process.env.GOOGLE_CLIENT_ID = "test-client-id";

const { createApp } = await import("../../src/it-assistant/server.js");
const { getDb, closeDb } = await import("../../src/it-assistant/db.js");
const { hashDeviceToken } = await import("../../src/it-assistant/auth.js");

let baseUrl: string;
let server: Server;

function sessionCookie(role: "member" | "admin" = "member") {
  const token = jwt.sign(
    { id: "user-1", email: "renato@baita.ac", name: "Renato", picture: "", role },
    process.env.SESSION_SECRET!,
    { expiresIn: "1h" },
  );
  return `it_session=${token}`;
}

beforeAll(async () => {
  const app = createApp();
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO users (id, email, name, picture, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("user-1", "renato@baita.ac", "Renato", "", "member", now);
  db.prepare(
    "INSERT INTO devices (id, user_id, name, location, token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("dev-1", "user-1", "Notebook", "Casa", hashDeviceToken("ita_test_token"), now);
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDb();
});

describe("Assistente de Infraestrutura de TI — API", () => {
  it("exige sessão para rotas protegidas", async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    expect(res.status).toBe(401);
  });

  it("rejeita relatório com token de dispositivo inválido", async () => {
    const res = await fetch(`${baseUrl}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token-errado" },
      body: JSON.stringify({ latencyMs: 10 }),
    });
    expect(res.status).toBe(401);
  });

  it("aceita relatório com token válido e classifica como crítico", async () => {
    const res = await fetch(`${baseUrl}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ita_test_token" },
      body: JSON.stringify({ latencyMs: 300, jitterMs: 5, packetLossPct: 0 }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("critical");
  });

  it("reflete o último relatório no status do time e abre um alerta", async () => {
    const statusRes = await fetch(`${baseUrl}/api/status`, { headers: { Cookie: sessionCookie() } });
    expect(statusRes.status).toBe(200);
    const { devices } = (await statusRes.json()) as { devices: Array<{ status: string }> };
    expect(devices).toHaveLength(1);
    expect(devices[0].status).toBe("critical");

    const alertsRes = await fetch(`${baseUrl}/api/alerts?open=true`, { headers: { Cookie: sessionCookie() } });
    const { alerts } = (await alertsRes.json()) as { alerts: unknown[] };
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("resolve o alerta automaticamente quando a rede volta ao normal", async () => {
    await fetch(`${baseUrl}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ita_test_token" },
      body: JSON.stringify({ latencyMs: 20, jitterMs: 3, packetLossPct: 0 }),
    });

    const alertsRes = await fetch(`${baseUrl}/api/alerts?open=true`, { headers: { Cookie: sessionCookie() } });
    const { alerts } = (await alertsRes.json()) as { alerts: unknown[] };
    expect(alerts).toHaveLength(0);
  });

  it("um membro comum não pode remover dispositivo de outro usuário", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO users (id, email, name, picture, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("user-2", "outra@baita.ac", "Outra Pessoa", "", "member", new Date().toISOString());

    const otherCookie = jwt.sign(
      { id: "user-2", email: "outra@baita.ac", name: "Outra Pessoa", picture: "", role: "member" },
      process.env.SESSION_SECRET!,
      { expiresIn: "1h" },
    );

    const res = await fetch(`${baseUrl}/api/devices/dev-1`, {
      method: "DELETE",
      headers: { Cookie: `it_session=${otherCookie}` },
    });
    expect(res.status).toBe(403);
  });
});
