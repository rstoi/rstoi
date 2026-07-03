/**
 * CadenceAgent — controla quando é apropriado acionar uma pessoa, evitando
 * sobrecarga, considerando janela preferida de interação e volume recente.
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { prisma } from "@/lib/prisma";

export type CadenceInput = { personId: string };
export type CadenceOutput = {
  canContactNow: boolean;
  reason: string;
  suggestedWindow: string | null;
};

const MAX_INTERACTIONS_PER_WEEK = 5;

export class CadenceAgent extends BaseAgent<CadenceInput, CadenceOutput> {
  readonly name = "CadenceAgent";
  readonly version = "1.0.0";
  readonly description = "Controla a cadência de interação para evitar sobrecarga.";

  protected async execute(input: CadenceInput): Promise<AgentRunResult<CadenceOutput>> {
    const person = await prisma.person.findUniqueOrThrow({ where: { id: input.personId } });
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentCount = await prisma.humanInteraction.count({
      where: { personId: input.personId, sentAt: { gte: oneWeekAgo } },
    });

    const overloaded = recentCount >= MAX_INTERACTIONS_PER_WEEK || person.overloadRisk === "HIGH";

    return {
      output: {
        canContactNow: !overloaded,
        reason: overloaded
          ? `${recentCount} interação(ões) nos últimos 7 dias — aguardar antes de nova solicitação.`
          : "Volume de interações dentro do limite recomendado.",
        suggestedWindow: person.bestInteractionWindow,
      },
      confidence: 0.8,
      warnings: overloaded
        ? [{ code: "OVERLOAD_RISK", message: `Risco de sobrecarga para ${person.name}.` }]
        : [],
      errors: [],
      ruleBasedMode: true,
    };
  }
}
