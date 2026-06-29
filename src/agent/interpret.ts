/**
 * Interpretador de comandos do agente (o "cérebro" do repo).
 *
 * Recebe o texto de um comando e o interpreta/executa via Claude (Anthropic)
 * com uma ferramenta `bash`, devolvendo a resposta em texto. É desacoplado do
 * transporte: tanto o agente Playwright (scripts/wa-agent.ts) quanto a ponte do
 * OpenClaw (scripts/openclaw-bridge.ts) reutilizam este módulo.
 *
 * Pré-requisitos:
 *   - ANTHROPIC_API_KEY no ambiente.
 *   - CLAUDE_MODEL no ambiente (id de um modelo Claude da Anthropic).
 */
import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";

export const PROJECT_DIR = process.env.PROJECT_DIR ?? "/home/user/rstoi";
const MAX_ROUNDS = 8;

/** Resolve o modelo a partir do ambiente; sem hardcode no código-fonte. */
export function resolveModel(): string {
  const m = process.env.CLAUDE_MODEL?.trim();
  if (!m) {
    throw new Error(
      "CLAUDE_MODEL não definido. Exporte CLAUDE_MODEL com o id de um modelo Claude da Anthropic.",
    );
  }
  return m;
}

/** Executa um comando bash no diretório do projeto (timeout 60s). */
export function runBash(command: string, cwd: string = PROJECT_DIR): string {
  try {
    const out = execSync(command, {
      cwd,
      timeout: 60_000,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return out.trim() || "(sem saída)";
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const detail = [e.stdout, e.stderr, e.message].filter(Boolean).join("\n").trim();
    return `ERRO: ${detail || "falha desconhecida"}`;
  }
}

export interface InterpretOptions {
  model?: string;
  projectDir?: string;
  maxRounds?: number;
}

/**
 * Loop agêntico: pede ao Claude para interpretar `userText`, executa as
 * chamadas de ferramenta `bash` e devolve o texto final.
 */
export async function interpretCommand(
  userText: string,
  opts: InterpretOptions = {},
): Promise<string> {
  const model = opts.model ?? resolveModel();
  const projectDir = opts.projectDir ?? PROJECT_DIR;
  const maxRounds = opts.maxRounds ?? MAX_ROUNDS;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userText }];
  const tools: Anthropic.Tool[] = [
    {
      name: "bash",
      description: `Executa um comando bash no projeto em ${projectDir}. Use para ler arquivos, rodar scripts npm, git, etc.`,
      input_schema: {
        type: "object",
        properties: { command: { type: "string", description: "Comando bash a executar" } },
        required: ["command"],
      },
    },
  ];

  const systemPrompt = `Você é o Agente Setup do projeto whatsapp-business-mcp em ${projectDir}.
Interprete o comando do usuário e execute as ações necessárias usando a ferramenta bash.
Scripts disponíveis: npm run build | test | dev | connect | agent | typecheck
Responda sempre em português, de forma concisa e direta.
Se o comando for ambíguo, execute o que faz mais sentido e explique brevemente o que fez.`;

  let lastText = "";
  let rounds = 0;

  while (rounds < maxRounds) {
    const resp = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    for (const block of resp.content) {
      if (block.type === "text") lastText = block.text;
    }

    if (resp.stop_reason === "end_turn") break;

    if (resp.stop_reason === "tool_use") {
      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      if (toolUses.length === 0) break;

      messages.push({ role: "assistant", content: resp.content });

      const results: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => {
        const input = tu.input as { command: string };
        console.error(`[interpret] $ ${input.command}`);
        const output = runBash(input.command, projectDir);
        console.error(`[interpret] → ${output.slice(0, 300).replace(/\n/g, " ")}`);
        return {
          type: "tool_result",
          tool_use_id: tu.id,
          content: output.slice(0, 10_000),
        };
      });

      messages.push({ role: "user", content: results });
      rounds++;
    } else {
      break;
    }
  }

  return lastText || "Concluído.";
}
