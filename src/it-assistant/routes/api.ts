import { Router, type Request } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db.js";
import { requireApiAuth, requireDeviceAuth, generateDeviceToken, hashDeviceToken } from "../auth.js";
import { evaluate, type Metrics } from "../thresholds.js";

export const apiRouter = Router();

apiRouter.get("/api/me", requireApiAuth, (req, res) => {
  res.json({ user: req.user });
});

// ── dispositivos ─────────────────────────────────────────────────────────────

apiRouter.post("/api/devices", requireApiAuth, (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const location = String(req.body?.location ?? "").trim() || null;
  if (!name) {
    res.status(400).json({ error: "Informe um nome para o dispositivo/local." });
    return;
  }

  const id = nanoid(12);
  const token = generateDeviceToken();
  const now = new Date().toISOString();

  getDb()
    .prepare(
      `INSERT INTO devices (id, user_id, name, location, token_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, req.user!.id, name, location, hashDeviceToken(token), now);

  // O token só é exibido nesta resposta — o servidor guarda apenas o hash.
  res.status(201).json({ id, name, location, token, createdAt: now });
});

apiRouter.get("/api/devices", requireApiAuth, (_req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT d.id, d.name, d.location, d.created_at, d.last_seen_at,
              u.name AS owner_name, u.email AS owner_email
       FROM devices d
       JOIN users u ON u.id = d.user_id
       ORDER BY d.created_at DESC`,
    )
    .all();
  res.json({ devices: rows });
});

function canManageDevice(req: Request, deviceUserId: string): boolean {
  return req.user!.role === "admin" || req.user!.id === deviceUserId;
}

apiRouter.delete("/api/devices/:id", requireApiAuth, (req, res) => {
  const db = getDb();
  const device = db.prepare("SELECT user_id FROM devices WHERE id = ?").get(req.params.id) as
    | { user_id: string }
    | undefined;
  if (!device) {
    res.status(404).json({ error: "Dispositivo não encontrado." });
    return;
  }
  if (!canManageDevice(req, device.user_id)) {
    res.status(403).json({ error: "Sem permissão para remover este dispositivo." });
    return;
  }
  const tx = db.transaction((id: string) => {
    db.prepare("DELETE FROM alerts WHERE device_id = ?").run(id);
    db.prepare("DELETE FROM reports WHERE device_id = ?").run(id);
    db.prepare("DELETE FROM devices WHERE id = ?").run(id);
  });
  tx(req.params.id);
  res.status(204).end();
});

apiRouter.post("/api/devices/:id/rotate-token", requireApiAuth, (req, res) => {
  const db = getDb();
  const device = db.prepare("SELECT user_id FROM devices WHERE id = ?").get(req.params.id) as
    | { user_id: string }
    | undefined;
  if (!device) {
    res.status(404).json({ error: "Dispositivo não encontrado." });
    return;
  }
  if (!canManageDevice(req, device.user_id)) {
    res.status(403).json({ error: "Sem permissão para gerar novo token." });
    return;
  }
  const token = generateDeviceToken();
  db.prepare("UPDATE devices SET token_hash = ? WHERE id = ?").run(hashDeviceToken(token), req.params.id);
  res.json({ token });
});

// ── ingestão de relatórios do agente ─────────────────────────────────────────

apiRouter.post("/api/report", requireDeviceAuth, (req, res) => {
  const body = req.body ?? {};
  const metrics: Metrics = {
    latencyMs: numOrNull(body.latencyMs),
    jitterMs: numOrNull(body.jitterMs),
    packetLossPct: numOrNull(body.packetLossPct),
    downloadMbps: numOrNull(body.downloadMbps),
    uploadMbps: numOrNull(body.uploadMbps),
    dnsMs: numOrNull(body.dnsMs),
  };
  const { status, verdicts } = evaluate(metrics);
  const ts = typeof body.ts === "string" ? body.ts : new Date().toISOString();
  const db = getDb();

  db.prepare(
    `INSERT INTO reports
       (device_id, ts, target, latency_ms, jitter_ms, packet_loss_pct, dns_ms,
        download_mbps, upload_mbps, wifi_ssid, wifi_signal_dbm, wifi_signal_pct,
        status, reasons_json)
     VALUES (@device_id, @ts, @target, @latencyMs, @jitterMs, @packetLossPct, @dnsMs,
             @downloadMbps, @uploadMbps, @wifiSsid, @wifiSignalDbm, @wifiSignalPct,
             @status, @reasonsJson)`,
  ).run({
    device_id: req.device!.id,
    ts,
    target: body.target ?? null,
    latencyMs: metrics.latencyMs ?? null,
    jitterMs: metrics.jitterMs ?? null,
    packetLossPct: metrics.packetLossPct ?? null,
    dnsMs: metrics.dnsMs ?? null,
    downloadMbps: metrics.downloadMbps ?? null,
    uploadMbps: metrics.uploadMbps ?? null,
    wifiSsid: body.wifiSsid ?? null,
    wifiSignalDbm: numOrNull(body.wifiSignalDbm),
    wifiSignalPct: numOrNull(body.wifiSignalPct),
    status,
    reasonsJson: JSON.stringify(verdicts),
  });

  db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(ts, req.device!.id);

  if (status === "ok") {
    db.prepare(
      "UPDATE alerts SET resolved_at = ? WHERE device_id = ? AND resolved_at IS NULL",
    ).run(ts, req.device!.id);
  } else {
    const openAlert = db
      .prepare(
        "SELECT id, severity FROM alerts WHERE device_id = ? AND resolved_at IS NULL ORDER BY ts DESC LIMIT 1",
      )
      .get(req.device!.id) as { id: number; severity: string } | undefined;
    if (!openAlert || openAlert.severity !== status) {
      const message =
        verdicts.map((v) => v.message).join("; ") || "Qualidade de rede degradada.";
      db.prepare(
        "INSERT INTO alerts (device_id, ts, severity, message) VALUES (?, ?, ?, ?)",
      ).run(req.device!.id, ts, status, message);
    }
  }

  res.status(201).json({ status, verdicts });
});

function numOrNull(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// ── status/histórico/alertas (dashboard) ─────────────────────────────────────

apiRouter.get("/api/status", requireApiAuth, (_req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT d.id, d.name, d.location, d.last_seen_at,
              u.name AS owner_name, u.email AS owner_email,
              r.ts, r.latency_ms, r.jitter_ms, r.packet_loss_pct, r.dns_ms,
              r.download_mbps, r.upload_mbps, r.wifi_ssid, r.wifi_signal_dbm,
              r.wifi_signal_pct, r.status, r.reasons_json
       FROM devices d
       JOIN users u ON u.id = d.user_id
       LEFT JOIN reports r ON r.id = (
         SELECT id FROM reports WHERE device_id = d.id ORDER BY ts DESC LIMIT 1
       )
       ORDER BY d.created_at DESC`,
    )
    .all();
  res.json({ devices: rows });
});

apiRouter.get("/api/devices/:id/history", requireApiAuth, (req, res) => {
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 24 * 30);
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT ts, latency_ms, jitter_ms, packet_loss_pct, download_mbps, upload_mbps, status
       FROM reports WHERE device_id = ? AND ts >= ? ORDER BY ts ASC`,
    )
    .all(req.params.id, since);
  res.json({ history: rows });
});

apiRouter.get("/api/alerts", requireApiAuth, (req, res) => {
  const openOnly = req.query.open !== "false";
  const rows = getDb()
    .prepare(
      `SELECT a.id, a.device_id, a.ts, a.severity, a.message, a.resolved_at,
              d.name AS device_name, u.name AS owner_name
       FROM alerts a
       JOIN devices d ON d.id = a.device_id
       JOIN users u ON u.id = d.user_id
       WHERE (? = 0 OR a.resolved_at IS NULL)
       ORDER BY a.ts DESC LIMIT 200`,
    )
    .all(openOnly ? 1 : 0);
  res.json({ alerts: rows });
});
