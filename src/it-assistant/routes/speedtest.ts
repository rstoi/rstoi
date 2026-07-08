import { Router, raw } from "express";
import { randomBytes } from "crypto";
import { requireDeviceAuth } from "../auth.js";

export const speedtestRouter = Router();

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — teto de segurança por chamada
const DEFAULT_BYTES = 8 * 1024 * 1024; // 8 MB

// Blob aleatório reutilizado (evita gerar dados novos a cada request; não é
// necessário criptograficamente aleatório, só incompressível o bastante para
// medir throughput real).
const chunk = randomBytes(1024 * 1024); // 1 MB

speedtestRouter.get("/speedtest/download", requireDeviceAuth, (req, res) => {
  const bytes = Math.min(Math.max(Number(req.query.bytes) || DEFAULT_BYTES, 1024), MAX_BYTES);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", String(bytes));
  res.setHeader("Cache-Control", "no-store");

  let sent = 0;
  const writeNext = () => {
    while (sent < bytes) {
      const remaining = bytes - sent;
      const piece = remaining >= chunk.length ? chunk : chunk.subarray(0, remaining);
      sent += piece.length;
      if (!res.write(piece)) {
        res.once("drain", writeNext);
        return;
      }
    }
    res.end();
  };
  writeNext();
});

speedtestRouter.post(
  "/speedtest/upload",
  requireDeviceAuth,
  raw({ type: "*/*", limit: `${MAX_BYTES}b` }),
  (req, res) => {
    const bytes = Buffer.isBuffer(req.body) ? req.body.length : 0;
    res.json({ receivedBytes: bytes });
  },
);
