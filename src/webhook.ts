import express, { type Request } from "express";
import crypto from "crypto";
import type { WhatsAppAdapter } from "./adapters/base.js";

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

export function createWebhookServer(adapter: WhatsAppAdapter): express.Express {
  const app = express();

  app.use(
    express.json({
      verify: (req: RawBodyRequest, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  // Webhook verification (GET) — Meta sends this once to verify the endpoint
  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"] as string;
    const challenge = req.query["hub.challenge"] as string;

    if (mode === "subscribe" && adapter.verifyWebhook) {
      try {
        const response = adapter.verifyWebhook(token, challenge);
        res.status(200).send(response);
      } catch {
        res.sendStatus(403);
      }
    } else {
      res.sendStatus(404);
    }
  });

  // Incoming messages (POST)
  app.post("/webhook", async (req: RawBodyRequest, res) => {
    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    const secret = process.env.WA_WEBHOOK_SECRET;

    if (secret && signature) {
      const expected = `sha256=${crypto
        .createHmac("sha256", secret)
        .update(req.rawBody ?? Buffer.alloc(0))
        .digest("hex")}`;
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        res.sendStatus(403);
        return;
      }
    }

    res.sendStatus(200);

    if (adapter.processWebhookPayload) {
      adapter.processWebhookPayload(req.body).catch(console.error);
    }
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      adapter: process.env.WA_ADAPTER ?? "baileys",
      connected: adapter.isConnected(),
    });
  });

  return app;
}
