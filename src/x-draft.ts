/**
 * Redação de posts para o X (@rtoi).
 *
 * Duas responsabilidades:
 *  - `splitIntoThread` — função PURA que quebra um texto em tweets de até 280
 *    chars, sem cortar no meio da palavra, com numeração opcional " (i/n)".
 *    É a rede de segurança: roda SEMPRE sobre a saída do modelo.
 *  - `draftPost` — usa a Claude API (claude-opus-4-8) para transformar uma
 *    ideia livre em um tweet ou thread na voz do @rtoi, retornando JSON estrito
 *    validado com zod.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const TWEET_LIMIT = 280;

export type DraftKind = "tweet" | "thread" | "reply" | "quote";

export interface DraftResult {
  tweets: string[];
  kind: DraftKind;
}

// ── splitIntoThread (pura) ──────────────────────────────────────────────────

export interface SplitOptions {
  limit?: number;
  numbered?: boolean;
}

/**
 * Quebra `text` em pedaços de até `limit` caracteres. Tenta cortar em limites
 * de frase; se uma frase ainda for grande demais, cai para limites de palavra.
 * Palavras maiores que o limite são fatiadas como último recurso (URLs, tokens).
 *
 * Quando `numbered` e houver mais de um pedaço, anexa " (i/n)" — e reserva esse
 * sufixo no orçamento de cada pedaço para nunca estourar o limite.
 */
export function splitIntoThread(text: string, opts: SplitOptions = {}): string[] {
  const limit = opts.limit ?? TWEET_LIMIT;
  const clean = (text ?? "").trim().replace(/\s+\n/g, "\n");
  if (!clean) return [];

  // 1ª passada sem numeração para saber quantos pedaços serão necessários.
  const rough = packChunks(clean, limit);
  if (rough.length <= 1) return rough;
  if (!opts.numbered) return rough;

  // Com numeração: o sufixo " (i/n)" consome orçamento. Como `n` pode mudar o
  // tamanho do sufixo, refazemos com um orçamento reduzido pela maior numeração
  // provável e iteramos até estabilizar.
  let n = rough.length;
  for (let guard = 0; guard < 5; guard++) {
    const suffixLen = ` (${n}/${n})`.length;
    const chunks = packChunks(clean, limit - suffixLen);
    if (chunks.length === n) {
      return chunks.map((c, i) => `${c} (${i + 1}/${chunks.length})`);
    }
    n = chunks.length;
  }
  // Fallback estável: usa o último n calculado.
  const suffixLen = ` (${n}/${n})`.length;
  const chunks = packChunks(clean, limit - suffixLen);
  return chunks.map((c, i) => `${c} (${i + 1}/${chunks.length})`);
}

/** Empacota o texto em pedaços <= limit, preferindo frases, depois palavras. */
function packChunks(text: string, limit: number): string[] {
  const safeLimit = Math.max(1, limit);
  const units = splitSentences(text);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const unit of units) {
    const piece = unit.trim();
    if (!piece) continue;

    if (piece.length > safeLimit) {
      // Frase grande demais: esvazia o buffer e quebra por palavras.
      flush();
      for (const sub of splitByWords(piece, safeLimit)) chunks.push(sub);
      continue;
    }

    const candidate = current ? `${current} ${piece}` : piece;
    if (candidate.length <= safeLimit) {
      current = candidate;
    } else {
      flush();
      current = piece;
    }
  }
  flush();
  return chunks.length ? chunks : [text.slice(0, safeLimit)];
}

/** Divide em frases preservando a pontuação final. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Quebra um trecho por palavras (e, se preciso, fatia palavras gigantes). */
function splitByWords(text: string, limit: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (word.length > limit) {
      if (current) { out.push(current); current = ""; }
      for (let i = 0; i < word.length; i += limit) out.push(word.slice(i, i + limit));
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= limit) {
      current = candidate;
    } else {
      out.push(current);
      current = word;
    }
  }
  if (current) out.push(current);
  return out;
}

// ── draftPost (Claude) ──────────────────────────────────────────────────────

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";

const draftSchema = z.object({
  tweets: z.array(z.string().trim().min(1)).min(1),
  kind: z.enum(["tweet", "thread", "reply", "quote"]).optional(),
});

export interface DraftOptions {
  /** "auto" deixa o modelo decidir entre tweet único e thread. */
  kind?: DraftKind | "auto";
  /** Contexto adicional (ex.: tweet sendo respondido/citado). */
  context?: string;
  client?: Anthropic;
}

const SYSTEM_PROMPT = `Você redige posts para a conta @rtoi no X (Twitter), em nome do dono da conta.
Voz: português do Brasil, direta, autêntica e natural — como uma pessoa real escreve, não um robô de marketing.
Regras:
- Cada tweet deve ter no MÁXIMO 280 caracteres.
- Sem hashtags em excesso (no máximo 1–2, só se agregarem).
- Sem emojis em excesso. Sem clickbait.
- Se a ideia rende mais que um tweet, divida em uma thread coerente (cada item se sustenta).
- Para respostas/citações, leve em conta o contexto fornecido e seja pertinente.
Responda SOMENTE com JSON válido, sem texto fora dele, no formato:
{"tweets": ["primeiro tweet", "segundo tweet"], "kind": "tweet"|"thread"|"reply"|"quote"}`;

/**
 * Transforma uma ideia livre em tweet(s) na voz do @rtoi. A saída do modelo é
 * sempre passada por `splitIntoThread` como rede de segurança contra estouro de
 * 280 chars, e a numeração de thread é aplicada quando há mais de um tweet.
 */
export async function draftPost(idea: string, opts: DraftOptions = {}): Promise<DraftResult> {
  const client = opts.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const requestedKind = opts.kind ?? "auto";

  const userParts = [`Ideia: ${idea.trim()}`];
  if (opts.context) userParts.push(`\nContexto (tweet alvo):\n${opts.context.trim()}`);
  if (requestedKind === "thread") userParts.push("\nFormato pedido: thread.");
  if (requestedKind === "tweet") userParts.push("\nFormato pedido: tweet único.");

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userParts.join("\n") }],
  });

  const raw = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const parsed = parseDraftJson(raw);

  // Resolve o tipo final: respeita o pedido explícito; senão usa o do modelo;
  // senão infere por quantidade de tweets.
  let kind: DraftKind;
  if (requestedKind === "reply" || requestedKind === "quote") kind = requestedKind;
  else if (requestedKind === "thread" || requestedKind === "tweet") kind = requestedKind;
  else kind = (parsed.kind as DraftKind | undefined) ?? (parsed.tweets.length > 1 ? "thread" : "tweet");

  // Rede de segurança: garante o limite de 280 e numera se virou thread.
  const joined = parsed.tweets.map((t) => t.trim()).filter(Boolean).join("\n\n");
  const tweets = splitIntoThread(joined, { numbered: parsed.tweets.length > 1 });

  return { tweets: tweets.length ? tweets : parsed.tweets, kind };
}

/** Extrai e valida o JSON do modelo, tolerando cercas ```json e texto ao redor. */
export function parseDraftJson(raw: string): { tweets: string[]; kind?: string } {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Resposta do modelo não contém JSON de rascunho.");
  }
  const obj = JSON.parse(body.slice(start, end + 1));
  return draftSchema.parse(obj);
}
