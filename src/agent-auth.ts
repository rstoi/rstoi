/**
 * Autorização do agente /setup (scripts/wa-agent.ts).
 *
 * O comando /setup executa shell arbitrário, então o acesso é controlado por:
 *  - WA_AGENT_GROUPS          — grupos onde o agente responde (nome ou JID).
 *  - WA_AGENT_ALLOWED_SENDERS — números autorizados a disparar /setup.
 *
 * Princípio: **negar por padrão**. Sem allowlist de remetentes, ninguém é
 * autorizado (evita execução remota aberta a terceiros).
 */
export function parseCsv(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Só números autorizados disparam /setup. Lista vazia => ninguém (deny). */
export function isSenderAllowed(fromId: string | undefined, allowed: string[]): boolean {
  if (allowed.length === 0) return false; // safe-by-default: negar
  const d = (fromId ?? "").replace(/\D/g, "");
  if (!d) return false;
  return allowed.some((a) => {
    const ad = a.replace(/\D/g, "");
    return ad.length > 0 && (d.endsWith(ad) || ad.endsWith(d));
  });
}

/**
 * Restringe a quais grupos o agente responde. Escopo vazio => qualquer chat
 * (comportamento padrão). Casa por nome do grupo (resolvido pelo chamador) ou
 * pelo JID, sem distinção de maiúsc./minúsc.
 */
export function isGroupInScope(
  chatId: string | undefined,
  groupName: string | undefined,
  scope: string[],
): boolean {
  if (scope.length === 0) return true;
  const hay = [chatId ?? "", groupName ?? ""].map((s) => s.toLowerCase());
  return scope.some((g) => {
    const gl = g.toLowerCase();
    return hay.some((h) => h.length > 0 && h.includes(gl));
  });
}
