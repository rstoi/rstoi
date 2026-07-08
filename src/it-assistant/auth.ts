import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { createHash, randomBytes } from "crypto";
import { getDb } from "./db.js";

export const ALLOWED_DOMAIN = process.env.IT_ASSISTANT_ALLOWED_DOMAIN ?? "baita.ac";
const SESSION_COOKIE = "it_session";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET não configurado (.env) — obrigatório para assinar sessões.");
  }
  return secret;
}

function googleClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) {
    throw new Error("GOOGLE_CLIENT_ID não configurado (.env) — necessário para login com Google.");
  }
  return id;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  picture: string;
  role: "member" | "admin";
}

function adminEmails(): Set<string> {
  return new Set(
    (process.env.IT_ASSISTANT_ADMINS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Verifica o ID token do Google Identity Services, restringe ao domínio
 * corporativo (hd claim OU sufixo do e-mail — o hd claim só existe para
 * contas Workspace, então checamos os dois) e faz upsert do usuário.
 */
export async function verifyGoogleCredential(idToken: string): Promise<SessionUser> {
  const client = new OAuth2Client(googleClientId());
  const ticket = await client.verifyIdToken({ idToken, audience: googleClientId() });
  const payload = ticket.getPayload();
  if (!payload) throw new Error("Token do Google inválido.");
  if (!payload.email || !payload.email_verified) {
    throw new Error("E-mail do Google não verificado.");
  }

  const emailDomain = payload.email.split("@")[1]?.toLowerCase();
  const hd = (payload as { hd?: string }).hd?.toLowerCase();
  if (emailDomain !== ALLOWED_DOMAIN.toLowerCase() && hd !== ALLOWED_DOMAIN.toLowerCase()) {
    throw new Error(`Acesso restrito a contas @${ALLOWED_DOMAIN}.`);
  }

  const role = adminEmails().has(payload.email.toLowerCase()) ? "admin" : "member";
  const user: SessionUser = {
    id: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email,
    picture: payload.picture ?? "",
    role,
  };

  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, name, picture, role, created_at, last_login_at)
     VALUES (@id, @email, @name, @picture, @role, @now, @now)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email, name = excluded.name, picture = excluded.picture,
       role = CASE WHEN @role = 'admin' THEN 'admin' ELSE users.role END,
       last_login_at = excluded.last_login_at`,
  ).run({ ...user, now });

  return user;
}

export function issueSessionCookie(res: Response, user: SessionUser): void {
  const token = jwt.sign(user, sessionSecret(), { expiresIn: "7d" });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE);
}

function readSession(req: Request): SessionUser | null {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, sessionSecret()) as SessionUser;
  } catch {
    return null;
  }
}

/** Middleware para páginas: redireciona ao /login se não houver sessão válida. */
export function requirePageAuth(req: Request, res: Response, next: NextFunction): void {
  const user = readSession(req);
  if (!user) {
    res.redirect("/login");
    return;
  }
  req.user = user;
  next();
}

/** Middleware para API: responde 401 JSON se não houver sessão válida. */
export function requireApiAuth(req: Request, res: Response, next: NextFunction): void {
  const user = readSession(req);
  if (!user) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  req.user = user;
  next();
}

// ── tokens de dispositivo (agente de monitoramento) ─────────────────────────

export function generateDeviceToken(): string {
  return "ita_" + randomBytes(24).toString("base64url");
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Middleware para o endpoint de ingestão de relatórios do agente. */
export function requireDeviceAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: "Token do dispositivo ausente." });
    return;
  }
  const tokenHash = hashDeviceToken(token);
  const device = getDb()
    .prepare("SELECT id, user_id, name FROM devices WHERE token_hash = ?")
    .get(tokenHash) as { id: string; user_id: string; name: string } | undefined;
  if (!device) {
    res.status(401).json({ error: "Token do dispositivo inválido." });
    return;
  }
  req.device = device;
  next();
}

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser;
    device?: { id: string; user_id: string; name: string };
  }
}
