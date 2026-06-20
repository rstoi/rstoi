// Cliente do gateway (Cloud Run): abre o WebSocket do terminal autenticado
// com o ID token do Firebase. O backend revalida o token e o domínio.
import { getIdToken } from "./firebase";

export const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "";

/** Abre um WebSocket para uma sessão pty ("terminal" | "claude"). */
export async function openShellSocket(
  kind: "terminal" | "claude",
): Promise<WebSocket> {
  const token = await getIdToken();
  if (!token) throw new Error("Sem sessão autenticada.");
  if (!GATEWAY_URL) throw new Error("NEXT_PUBLIC_GATEWAY_URL não configurado.");

  const base = GATEWAY_URL.replace(/^http/, "ws").replace(/\/$/, "");
  const url = `${base}/pty?kind=${encodeURIComponent(kind)}&token=${encodeURIComponent(token)}`;
  return new WebSocket(url);
}
