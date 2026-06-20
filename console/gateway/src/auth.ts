// Verificação do ID token do Firebase + restrição de domínio + RBAC.
// Esta é a AUTORIDADE de segurança do login: o cliente não é confiável.
//
// A política pura (`applyPolicy`) é separada da verificação criptográfica
// (`verify`) para ser testável sem Firebase.
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function allowedDomain(): string {
  return (process.env.ALLOWED_DOMAIN ?? "setup.com.br").toLowerCase();
}

function operatorRoles(): string[] {
  return (process.env.OPERATOR_ROLES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

let initialized = false;
function ensureApp(): void {
  if (initialized || getApps().length) {
    initialized = true;
    return;
  }
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
  });
  initialized = true;
}

export interface Principal {
  uid: string;
  email: string;
  roles: string[];
  isOperator: boolean;
}

/** Forma mínima de um token decodificado (subset do DecodedIdToken). */
export interface MinimalClaims {
  uid?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  roles?: unknown;
}

/**
 * Política de acesso (pura): impõe domínio @setup.com.br e e-mail verificado,
 * e resolve papéis (RBAC). Lança em caso de recusa.
 */
export function applyPolicy(claims: MinimalClaims): Principal {
  const email = (claims.email ?? "").toLowerCase();
  const domain = email.split("@")[1];
  if (!claims.email_verified || domain !== allowedDomain()) {
    throw new Error(`acesso restrito a contas @${allowedDomain()}`);
  }
  const claimRoles = Array.isArray(claims.roles) ? (claims.roles as unknown[]) : [];
  const roles = claimRoles.map((r) => String(r).toLowerCase());
  const ops = operatorRoles();
  const isOperator = roles.some((r) => ops.includes(r));
  return { uid: claims.uid ?? claims.sub ?? "", email, roles, isOperator };
}

/** Valida o token (assinatura/expiração) e aplica a política. */
export async function verify(token: string): Promise<Principal> {
  ensureApp();
  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(token, true);
  } catch {
    throw new Error("token inválido");
  }
  return applyPolicy(decoded as MinimalClaims);
}

/** Sessões sensíveis (Terminal/Claude CLI) exigem papel de operador. */
export function requireOperator(p: Principal): void {
  if (!p.isOperator) throw new Error("sem permissão para sessões de shell");
}
