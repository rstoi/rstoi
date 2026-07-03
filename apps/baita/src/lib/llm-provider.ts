/**
 * Camada abstrata de acesso a LLM. Os agentes nunca chamam um fornecedor
 * diretamente — sempre passam por LLMProvider. No MVP, sem chave configurada,
 * o provider "mock" responde de forma determinística (rule-based), permitindo
 * que todo o produto funcione sem depender de IA generativa externa.
 */
export interface LLMCompletionRequest {
  system?: string;
  prompt: string;
  maxTokens?: number;
}

export interface LLMCompletionResult {
  text: string;
  provider: string;
  ruleBasedFallback: boolean;
}

export interface LLMProvider {
  readonly name: string;
  complete(request: LLMCompletionRequest): Promise<LLMCompletionResult>;
}

class MockLLMProvider implements LLMProvider {
  readonly name = "mock";

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResult> {
    return {
      text: `[modo regras — sem provedor de IA configurado] ${request.prompt.slice(0, 240)}`,
      provider: this.name,
      ruleBasedFallback: true,
    };
  }
}

// Espaço reservado para futura integração real (Anthropic/OpenAI). O agente
// só é instanciado quando a chave de API correspondente está presente.
class AnthropicLLMProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResult> {
    // Integração real fica para uma fase futura; hoje reforça o uso do modo
    // determinístico mesmo com chave presente, evitando dependência oculta.
    void this.apiKey;
    void request;
    throw new Error(
      "Integração Anthropic ainda não habilitada neste MVP. Use LLM_PROVIDER=mock."
    );
  }
}

let cachedProvider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (cachedProvider) return cachedProvider;

  const configured = (process.env.LLM_PROVIDER || "mock").toLowerCase();
  if (configured === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    cachedProvider = new AnthropicLLMProvider(process.env.ANTHROPIC_API_KEY);
  } else {
    cachedProvider = new MockLLMProvider();
  }
  return cachedProvider;
}

export function isRuleBasedMode(): boolean {
  return getLLMProvider().name === "mock";
}
