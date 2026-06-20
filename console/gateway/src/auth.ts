// Verificação do ID token do Firebase + restrição de domínio + RBAC.
// Esta é a AUTORIDADE de segurança do login: o cliente não é confiável.
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN ?? "setup.com.br";
const OPERATOR_ROLES = (process.env.OPERATOR_ROLES ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
  });
}

export interface Principal {
  uid: string;
  email: string;
  roles: string[];
  isOperator: boolean;
}

/** Valida o token e impõe domínio @setup.com.br. Lança em caso de recusa. */
export async function verify(token: string): Promise<Principal> {
  let decoded: DecodedIdToken;
  try {
    decoded = await getAuth().verifyIdToken(token, true);
  } catch {
    throw new Error("token inválido");
  }

  const email = (decoded.email ?? "").toLowerCase();
  const domain = email.split("@")[1];
  if (!decoded.email_verified || domain !== ALLOWED_DOMAIN) {
    throw new Error(`acesso restrito a contas @${ALLOWED_DOMAIN}`);
  }

  // RBAC: papéis vêm das custom claims (sincronizadas dos grupos do Workspace).
  const claimRoles: string[] = Array.isArray((decoded as Record<string, unknown>).roles)
    ? ((decoded as Record<string, unknown>).roles as string[])
    : [];
  const roles = claimRoles.map((r) => r.toLowerCase());
  const isOperator = roles.some((r) => OPERATOR_ROLES.includes(r));

  return { uid: decoded.uid, email, roles, isOperator };
}

/** Sessões sensíveis (Terminal/Claude CLI) exigem papel de operador. */
export function requireOperator(p: Principal): void {
  if (!p.isOperator) throw new Error("sem permissão para sessões de shell");
}
