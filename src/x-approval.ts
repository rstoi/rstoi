/**
 * Máquina de estados do fluxo rascunho → aprovação → publicação do agente X.
 *
 * O dono dispara `/x <ideia>` no WhatsApp; o agente rascunha e (por padrão)
 * pede aprovação na mesma conversa antes de publicar em nome do @rtoi. Este
 * módulo concentra a lógica PURA (parsing de comando, palavras-chave de
 * aprovação, decisão de auto-post, expiração) e um store de rascunhos pendentes
 * espelhado em SQLite (sobrevive a restart + auditoria).
 */
import type { Database } from "better-sqlite3";
import { getDb } from "./store/db.js";
import type { DraftKind } from "./x-draft.js";

// ── Tipos ───────────────────────────────────────────────────────────────────

export type XCommandType =
  | "post"      // /x <ideia> (tweet ou thread, modelo decide)
  | "thread"    // /x thread <ideia>
  | "reply"     // /x responder <url> <ideia>
  | "quote"     // /x citar <url> <ideia>
  | "like"      // /x curtir <url>
  | "repost"    // /x repostar <url>
  | "mentions"  // /x mentions  (lê e resume, não publica)
  | "help";     // /x ajuda

export interface XCommand {
  type: XCommandType;
  idea: string;
  targetUrl?: string;
}

export type DraftStatus = "awaiting_approval" | "editing";

export interface PendingDraft {
  chatId: string;
  requestedBy: string;
  idea: string;
  tweets: string[];
  kind: DraftKind;
  targetUrl?: string;
  createdAt: number;
  expiresAt: number;
  status: DraftStatus;
}

export type AutoPostMode = "off" | "all" | DraftKind[];

export type ReplyAction = "publish" | "edit" | "cancel" | "none";

// ── Parsing do comando /x (puro) ────────────────────────────────────────────

const URL_RE = /https?:\/\/\S+/i;

/**
 * Interpreta o corpo de uma mensagem `/x ...`. `body` é o texto SEM o prefixo
 * `/x`. Reconhece subcomandos em português; o padrão é `post`.
 */
export function parseXCommand(body: string): XCommand {
  const text = (body ?? "").trim();
  if (!text) return { type: "post", idea: "" };

  const [firstWord, ...rest] = text.split(/\s+/);
  const head = firstWord.toLowerCase();
  const tail = rest.join(" ").trim();

  switch (head) {
    case "ajuda":
    case "help":
    case "?":
      return { type: "help", idea: "" };
    case "mentions":
    case "mencoes":
    case "menções":
      return { type: "mentions", idea: "" };
    case "thread":
      return { type: "thread", idea: tail };
    case "responder":
    case "resp":
    case "reply": {
      const { url, idea } = extractUrl(tail);
      return { type: "reply", idea, targetUrl: url };
    }
    case "citar":
    case "quote": {
      const { url, idea } = extractUrl(tail);
      return { type: "quote", idea, targetUrl: url };
    }
    case "curtir":
    case "like": {
      const { url } = extractUrl(tail);
      return { type: "like", idea: "", targetUrl: url };
    }
    case "repostar":
    case "rt":
    case "repost": {
      const { url } = extractUrl(tail);
      return { type: "repost", idea: "", targetUrl: url };
    }
    default:
      return { type: "post", idea: text };
  }
}

/** Separa a primeira URL do restante do texto (a ideia). */
function extractUrl(text: string): { url?: string; idea: string } {
  const match = text.match(URL_RE);
  if (!match) return { idea: text.trim() };
  const url = match[0];
  const idea = text.replace(url, "").trim();
  return { url, idea };
}

/** Comando que produz um rascunho de texto (passa pelo fluxo de aprovação). */
export function isDraftingCommand(type: XCommandType): boolean {
  return type === "post" || type === "thread" || type === "reply" || type === "quote";
}

// ── Palavras-chave de aprovação (puro) ──────────────────────────────────────

const PUBLISH_WORDS = new Set(["ok", "publicar", "postar", "sim", "publica", "posta", "👍"]);
const CANCEL_WORDS = new Set(["cancelar", "cancela", "não", "nao", "descartar", "x"]);

/**
 * Classifica uma resposta do usuário enquanto há rascunho pendente.
 * `editar <texto>` retorna `edit` com o novo texto/orientação.
 */
export function classifyReply(text: string): { action: ReplyAction; editText?: string } {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { action: "none" };
  const lower = trimmed.toLowerCase();

  const editMatch = lower.match(/^(editar|edita|ajustar|ajusta|edit)\b\s*(.*)$/s);
  if (editMatch) return { action: "edit", editText: trimmed.slice(editMatch[1].length).trim() };

  const firstWord = lower.split(/\s+/)[0];
  if (PUBLISH_WORDS.has(lower) || PUBLISH_WORDS.has(firstWord)) return { action: "publish" };
  if (CANCEL_WORDS.has(lower) || CANCEL_WORDS.has(firstWord)) return { action: "cancel" };
  return { action: "none" };
}

// ── Auto-post e expiração (puro) ────────────────────────────────────────────

/** Converte o valor de `X_AUTO_POST` (env) numa configuração tipada. */
export function parseAutoPostMode(value?: string): AutoPostMode {
  const v = (value ?? "off").trim().toLowerCase();
  if (v === "" || v === "off" || v === "false" || v === "0") return "off";
  if (v === "all" || v === "true" || v === "1") return "all";
  const kinds = v
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is DraftKind => ["tweet", "thread", "reply", "quote"].includes(s));
  return kinds.length ? kinds : "off";
}

/** Decide se um rascunho de dado `kind` deve ser publicado sem aprovação. */
export function shouldAutoPost(kind: DraftKind, mode: AutoPostMode): boolean {
  if (mode === "off") return false;
  if (mode === "all") return true;
  return mode.includes(kind);
}

export function isExpired(draft: Pick<PendingDraft, "expiresAt">, now: number = Date.now()): boolean {
  return now >= draft.expiresAt;
}

// ── Store de rascunhos pendentes (memória + SQLite) ─────────────────────────

const pending = new Map<string, PendingDraft>();

/** Cria as tabelas do agente X (idempotente). */
export function initXSchema(db: Database = getDb()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS x_drafts (
      chat_id      TEXT PRIMARY KEY,
      requested_by TEXT NOT NULL,
      idea         TEXT,
      tweets_json  TEXT NOT NULL DEFAULT '[]',
      kind         TEXT NOT NULL DEFAULT 'tweet',
      target_url   TEXT,
      status       TEXT NOT NULL DEFAULT 'awaiting_approval',
      created_at   INTEGER NOT NULL,
      expires_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS x_posts (
      id         TEXT PRIMARY KEY,
      url        TEXT,
      author     TEXT,
      text       TEXT,
      kind       TEXT,
      source     TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_x_posts_created ON x_posts(created_at);
  `);
}

/** Guarda/atualiza o rascunho pendente de um chat (memória + SQLite). */
export function putPendingDraft(draft: PendingDraft, db: Database = getDb()): void {
  pending.set(draft.chatId, draft);
  initXSchema(db);
  db.prepare(`
    INSERT OR REPLACE INTO x_drafts
      (chat_id, requested_by, idea, tweets_json, kind, target_url, status, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    draft.chatId, draft.requestedBy, draft.idea,
    JSON.stringify(draft.tweets), draft.kind, draft.targetUrl ?? null,
    draft.status, draft.createdAt, draft.expiresAt,
  );
}

export function getPendingDraft(chatId: string): PendingDraft | undefined {
  return pending.get(chatId);
}

export function clearPendingDraft(chatId: string, db: Database = getDb()): void {
  pending.delete(chatId);
  try {
    db.prepare("DELETE FROM x_drafts WHERE chat_id = ?").run(chatId);
  } catch { /* tabela pode não existir ainda */ }
}

/** Registra um post publicado (ou item lido) para auditoria/cache. */
export function recordPost(
  entry: { id: string; url?: string; author?: string; text?: string; kind?: string; source: string },
  db: Database = getDb(),
): void {
  initXSchema(db);
  db.prepare(`
    INSERT OR REPLACE INTO x_posts (id, url, author, text, kind, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(entry.id, entry.url ?? null, entry.author ?? null, entry.text ?? null,
         entry.kind ?? null, entry.source, Date.now());
}
