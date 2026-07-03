/**
 * BaseAgent — contrato comum a todos os agentes da plataforma. Cada agente
 * concentra uma responsabilidade do ciclo de diagnóstico financeiro e
 * expõe run() com entrada/saída tipadas, nível de confiança, avisos/erros e
 * possibilidade de auditoria. Todos operam em modo determinístico
 * (rule-based) por padrão — dependem de LLMProvider apenas quando disponível.
 */
import { recordAudit } from "@/lib/audit";
import { isRuleBasedMode } from "@/lib/llm-provider";

export type AgentWarning = { code: string; message: string };
export type AgentError = { code: string; message: string };

export type AgentRunResult<TOutput> = {
  output: TOutput;
  confidence: number; // 0 a 1
  warnings: AgentWarning[];
  errors: AgentError[];
  ruleBasedMode: boolean;
};

export type AgentAuditContext = {
  companyId?: string | null;
  actorUserId?: string | null;
  rationale?: string;
};

export abstract class BaseAgent<TInput, TOutput> {
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly description: string;

  protected abstract execute(input: TInput): Promise<AgentRunResult<TOutput>>;

  async run(input: TInput, audit?: AgentAuditContext): Promise<AgentRunResult<TOutput>> {
    const result = await this.execute(input);

    if (audit) {
      await recordAudit({
        companyId: audit.companyId ?? null,
        actorUserId: audit.actorUserId ?? null,
        agentName: `${this.name}@${this.version}`,
        action: "AGENT_RUN",
        entityType: "Agent",
        entityId: this.name,
        after: {
          confidence: result.confidence,
          warnings: result.warnings,
          errors: result.errors,
        },
        rationale: audit.rationale ?? `Execução do agente ${this.name}.`,
      });
    }

    return { ...result, ruleBasedMode: isRuleBasedMode() };
  }
}
