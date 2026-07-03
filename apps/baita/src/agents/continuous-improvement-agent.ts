/**
 * ContinuousImprovementAgent — a partir de um desvio relevante (ex.: viés de
 * backtesting, recomendação não cumprida), estrutura um ciclo PDCA e sugere
 * ações corretivas/preventivas.
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { prisma } from "@/lib/prisma";

export type ContinuousImprovementInput = {
  companyId: string;
  problem: string;
  rootCauseHint?: string;
  ownerPersonId?: string;
  dueDate?: Date;
};

export type ContinuousImprovementOutput = {
  pdcaId: string;
  improvementActionId: string;
};

export class ContinuousImprovementAgent extends BaseAgent<
  ContinuousImprovementInput,
  ContinuousImprovementOutput
> {
  readonly name = "ContinuousImprovementAgent";
  readonly version = "1.0.0";
  readonly description = "Estrutura ciclos PDCA e ações corretivas/preventivas a partir de desvios.";

  protected async execute(input: ContinuousImprovementInput): Promise<AgentRunResult<ContinuousImprovementOutput>> {
    const pdca = await prisma.pDCARecord.create({
      data: {
        companyId: input.companyId,
        cycleName: `PDCA — ${input.problem.slice(0, 80)}`,
        planText: `Investigar e planejar correção para: ${input.problem}`,
        status: "PLAN",
        ownerPersonId: input.ownerPersonId,
        dueDate: input.dueDate,
      },
    });

    const improvementAction = await prisma.improvementAction.create({
      data: {
        companyId: input.companyId,
        problem: input.problem,
        rootCause: input.rootCauseHint ?? null,
        ownerPersonId: input.ownerPersonId,
        dueDate: input.dueDate,
        status: "OPEN",
      },
    });

    return {
      output: { pdcaId: pdca.id, improvementActionId: improvementAction.id },
      confidence: input.rootCauseHint ? 0.7 : 0.4,
      warnings: input.rootCauseHint
        ? []
        : [{ code: "NO_ROOT_CAUSE", message: "Causa raiz ainda não identificada — necessário investigar antes do Do." }],
      errors: [],
      ruleBasedMode: true,
    };
  }
}
