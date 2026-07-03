/**
 * HumanProfileAgent — analisa o perfil operacional de uma pessoa (canal,
 * formato, estágio de carreira, confiabilidade por tema) e recomenda a
 * abordagem de interação adequada.
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { prisma } from "@/lib/prisma";
import type { CareerStage } from "@prisma/client";

export type HumanProfileInput = { personId: string };
export type HumanProfileOutput = {
  careerStage: CareerStage;
  approach: string[];
  preferredChannel: string | null;
  topicReliability: { topic: string; rating: string }[];
  overloadWarning: string | null;
};

const CAREER_STAGE_APPROACH: Record<CareerStage, string[]> = {
  BEGINNER: ["Usar checklist detalhado", "Fornecer instrução passo a passo", "Revisar o trabalho antes de decisão final"],
  GROWING: ["Delegar em blocos com critérios claros", "Dar feedback frequente", "Aumentar autonomia gradualmente"],
  SENIOR: ["Discutir trade-offs e cenários", "Delegar decisão com contexto", "Focar em liderança e processo"],
  PHASEOUT: ["Capturar conhecimento crítico", "Planejar sucessão", "Reduzir dependência da pessoa nas decisões"],
};

export class HumanProfileAgent extends BaseAgent<HumanProfileInput, HumanProfileOutput> {
  readonly name = "HumanProfileAgent";
  readonly version = "1.0.0";
  readonly description = "Analisa perfil operacional e recomenda abordagem de interação.";

  protected async execute(input: HumanProfileInput): Promise<AgentRunResult<HumanProfileOutput>> {
    const person = await prisma.person.findUniqueOrThrow({
      where: { id: input.personId },
      include: { topicReliabilities: true, humanInteractions: { orderBy: { sentAt: "desc" }, take: 20 } },
    });

    const approach = CAREER_STAGE_APPROACH[person.careerStage];

    const recentInteractions = person.humanInteractions;
    const overloadWarning =
      recentInteractions.length >= 10
        ? "Volume alto de interações recentes — avaliar risco de sobrecarga antes de nova solicitação."
        : person.overloadRisk === "HIGH"
          ? "Risco de sobrecarga marcado manualmente — espaçar novas solicitações."
          : null;

    const topicReliability = person.topicReliabilities.map((t) => ({ topic: t.topic, rating: t.rating }));

    const warnings: AgentRunResult<HumanProfileOutput>["warnings"] = [];
    if (!person.preferredChannel) {
      warnings.push({ code: "NO_CHANNEL", message: "Canal preferido não definido para esta pessoa." });
    }
    if (overloadWarning) {
      warnings.push({ code: "OVERLOAD_RISK", message: overloadWarning });
    }

    return {
      output: {
        careerStage: person.careerStage,
        approach,
        preferredChannel: person.preferredChannel,
        topicReliability,
        overloadWarning,
      },
      confidence: person.preferredChannel ? 0.8 : 0.5,
      warnings,
      errors: [],
      ruleBasedMode: true,
    };
  }
}
