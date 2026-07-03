import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

export const SESSION_COOKIE = "baita_session";
const SESSION_TTL_DAYS = 7;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, tokenHash, expiresAt } });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (!session.user.active) return null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Não autenticado.");
  return user;
}

export class AuthError extends Error {}
export class ForbiddenError extends Error {}

// Papéis com acesso irrestrito a todas as empresas (uso interno/consultoria).
const GLOBAL_ROLES: UserRole[] = ["ADMIN", "CONSULTANT", "AUDITOR"];

/**
 * Garante isolamento por empresa: usuários com papel "global" (admin/consultor/auditor)
 * acessam qualquer empresa; demais papéis exigem vínculo explícito via CompanyUserAccess.
 */
export async function requireCompanyAccess(companyId: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (GLOBAL_ROLES.includes(user.role)) return user;

  const access = await prisma.companyUserAccess.findUnique({
    where: { companyId_userId: { companyId, userId: user.id } },
  });
  if (!access) {
    throw new ForbiddenError("Usuário sem acesso a esta empresa.");
  }
  return user;
}
