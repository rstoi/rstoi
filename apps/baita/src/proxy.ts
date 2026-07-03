import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Verificação leve de presença de cookie de sessão, apenas para redirecionar
 * visitantes não autenticados para /login. A validação real de sessão e de
 * RBAC (papel/empresa) acontece em getCurrentUser()/requireCompanyAccess()
 * dentro de cada página e server action — nunca confiar apenas no proxy.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;

  if (!hasSession && pathname !== "/login") {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }

  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/empresas", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
