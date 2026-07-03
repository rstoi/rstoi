/**
 * OrganizationalDevelopmentAgent — avalia estágio Adizes, maturidade
 * organizacional e sugere o próximo sistema gerencial a implantar, evitando
 * excesso de burocracia (não pula etapas da escada de maturidade).
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { getAdizesProfile, suggestNextManagementLevel } from "@/lib/organizational-development-service";
import { prisma } from "@/lib/prisma";
import type { AdizesLifecycleStage } from "@prisma/client";

export type OrganizationalDevelopmentInput = {
  companyId: string;
  observedStage: AdizesLifecycleStage;
  stageConfidence: number;
};

export type OrganizationalDevelopmentOutput = {
  stage: AdizesLifecycleStage;
  profile: ReturnType<typeof getAdizesProfile>;
  nextManagementLevel: ReturnType<typeof suggestNextManagementLevel>;
};

export class OrganizationalDevelopmentAgent extends BaseAgent<
  OrganizationalDevelopmentInput,
  OrganizationalDevelopmentOutput
> {
  readonly name = "OrganizationalDevelopmentAgent";
  readonly version = "1.0.0";
  readonly description = "Avalia estágio Adizes e sugere próximo sistema gerencial.";

  protected async execute(
    input: OrganizationalDevelopmentInput
  ): Promise<AgentRunResult<OrganizationalDevelopmentOutput>> {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: input.companyId } });
    const profile = getAdizesProfile(input.observedStage);
    const nextManagementLevel = suggestNextManagementLevel(company.managementSystemLevel);

    await prisma.company.update({
      where: { id: input.companyId },
      data: {
        lifecycleStageAdizes: input.observedStage,
        lifecycleStageConfidence: input.stageConfidence,
      },
    });

    return {
      output: { stage: input.observedStage, profile, nextManagementLevel },
      confidence: input.stageConfidence,
      warnings:
        input.stageConfidence < 0.5
          ? [{ code: "LOW_CONFIDENCE_STAGE", message: "Confiança baixa na avaliação do estágio Adizes — aprofundar diagnóstico." }]
          : [],
      errors: [],
      ruleBasedMode: true,
    };
  }
}
