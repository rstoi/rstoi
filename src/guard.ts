import type { WhatsAppAdapter } from "./adapters/base.js";
import type { Message } from "./types/index.js";

/**
 * Guardrail de chats/grupos bloqueados.
 *
 * Lê a lista de `WA_BLOCKED_GROUPS` (nomes ou JIDs, separados por vírgula) e
 * envolve o adaptador de WhatsApp para que NENHUM agente monitore ou interaja
 * com esses chats — independentemente da ferramenta usada. É o ponto único por
 * onde tools e resources passam (ver server.ts).
 */
export function getBlockedGroups(): string[] {
  return (process.env.WA_BLOCKED_GROUPS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function matches(blocked: string[], value?: string): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return blocked.some((b) => v === b || v.includes(b));
}

/**
 * IDs (JIDs) de chats bloqueados conhecidos no banco — usado para filtrar
 * leituras diretas no store (ex.: search_messages), que não passam pelo
 * adaptador. Resolve nomes de grupo via tabela `groups`.
 */
export function getBlockedChatIds(db: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prepare: (sql: string) => { all: (...a: any[]) => any[] };
}): Set<string> {
  const blocked = getBlockedGroups();
  const ids = new Set<string>();
  if (blocked.length === 0) return ids;
  try {
    const groups = db.prepare("SELECT id, name FROM groups").all() as Array<{
      id: string;
      name: string;
    }>;
    for (const g of groups) {
      if (matches(blocked, g.name) || matches(blocked, g.id)) ids.add(g.id);
    }
  } catch {
    /* tabela pode não existir ainda */
  }
  for (const b of blocked) if (b.includes("@")) ids.add(b);
  return ids;
}

// Métodos cujo argumento (no índice indicado) carrega o chat/grupo alvo.
const TARGET_ARG: Record<string, number> = {
  sendMessage: 0,
  editMessage: 1,
  deleteMessage: 1,
  reactToMessage: 1,
  markAsRead: 0,
  getMessages: 0,
  getGroup: 0,
  updateGroup: 0,
  addGroupMember: 0,
  removeGroupMember: 0,
  promoteGroupMember: 0,
  demoteGroupMember: 0,
  leaveGroup: 0,
  getGroupInviteLink: 0,
};

const LIST_METHODS = new Set(["listChats", "listGroups"]);

/**
 * Devolve um adaptador "guardado". Se `WA_BLOCKED_GROUPS` estiver vazio,
 * devolve o adaptador original sem overhead.
 */
export function guardAdapter(adapter: WhatsAppAdapter): WhatsAppAdapter {
  const blocked = getBlockedGroups();
  if (blocked.length === 0) return adapter;

  const nameCache = new Map<string, string>(); // jid -> nome (minúsculo)

  const remember = (items: Array<{ id?: string; name?: string }>) => {
    for (const it of items) {
      if (it && it.id && it.name) nameCache.set(it.id, it.name.toLowerCase());
    }
  };

  const resolveName = async (id: string): Promise<string | undefined> => {
    if (nameCache.has(id)) return nameCache.get(id);
    if (id.endsWith("@g.us")) {
      try {
        const g = await adapter.getGroup(id);
        if (g?.name) {
          nameCache.set(id, g.name.toLowerCase());
          return g.name.toLowerCase();
        }
      } catch {
        /* resolução best-effort */
      }
    }
    return undefined;
  };

  const isBlockedTarget = async (id: string): Promise<boolean> => {
    if (!id) return false;
    if (matches(blocked, id)) return true; // casa por JID/nome literal
    return matches(blocked, await resolveName(id));
  };

  const blockError = (id: string) =>
    new Error(
      `Interação bloqueada: o chat/grupo "${id}" está na lista WA_BLOCKED_GROUPS e não pode ser monitorado nem acessado por política.`,
    );

  return new Proxy(adapter, {
    get(target, prop: string, receiver) {
      const orig = Reflect.get(target, prop, receiver);

      // Criar grupo com nome bloqueado também é barrado.
      if (prop === "createGroup" && typeof orig === "function") {
        return async (...args: unknown[]) => {
          if (typeof args[0] === "string" && matches(blocked, args[0])) {
            throw blockError(args[0]);
          }
          return (orig as (...a: unknown[]) => unknown).apply(target, args);
        };
      }

      // Ações sobre um chat/grupo específico: barra se for bloqueado.
      if (prop in TARGET_ARG && typeof orig === "function") {
        return async (...args: unknown[]) => {
          const id = args[TARGET_ARG[prop]];
          if (typeof id === "string" && (await isBlockedTarget(id))) {
            throw blockError(id);
          }
          return (orig as (...a: unknown[]) => unknown).apply(target, args);
        };
      }

      // Listagens: remove os chats/grupos bloqueados do resultado.
      if (LIST_METHODS.has(prop) && typeof orig === "function") {
        return async (...args: unknown[]) => {
          const res = await (orig as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          if (Array.isArray(res)) {
            remember(res as Array<{ id?: string; name?: string }>);
            return (res as Array<{ id?: string; name?: string }>).filter(
              (x) => !matches(blocked, x.id) && !matches(blocked, x.name),
            );
          }
          return res;
        };
      }

      return orig;
    },

    set(target, prop: string, value, receiver) {
      // Não monitorar mensagens recebidas do grupo bloqueado.
      if (prop === "onMessage" && typeof value === "function") {
        const handler = value as (m: Message) => void;
        const wrapped = (message: Message) => {
          const cid = message?.chatId;
          if (!cid) return handler(message);
          if (matches(blocked, cid)) return; // JID literal bloqueado
          const cached = nameCache.get(cid);
          if (cached !== undefined) {
            if (!matches(blocked, cached)) handler(message);
            return;
          }
          // Nome ainda não conhecido: resolve e decide (best-effort).
          resolveName(cid)
            .then((name) => {
              if (!matches(blocked, name)) handler(message);
            })
            .catch(() => handler(message));
        };
        return Reflect.set(target, prop, wrapped, receiver);
      }
      return Reflect.set(target, prop, value, receiver);
    },
  });
}
