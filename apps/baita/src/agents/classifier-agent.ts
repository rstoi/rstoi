/**
 * ClassifierAgent — classifica eventos financeiros no plano gerencial
 * (ManagementCategory) usando palavras-chave (ruleHints) cadastradas por
 * categoria. Eventos sem correspondência ficam marcados para revisão manual.
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { prisma } from "@/lib/prisma";

export type ClassifierInput = { companyId: string };
export type ClassifierOutput = {
  classified: number;
  needsReview: number;
};

function matchesHints(description: string, hints: string): boolean {
  const keywords = hints
    .split(",")
    .map((h) => h.trim().toUpperCase())
    .filter(Boolean);
  return keywords.some((keyword) => description.includes(keyword));
}

export class ClassifierAgent extends BaseAgent<ClassifierInput, ClassifierOutput> {
  readonly name = "ClassifierAgent";
  readonly version = "1.0.0";
  readonly description = "Classifica eventos financeiros no plano de contas gerencial.";

  protected async execute(input: ClassifierInput): Promise<AgentRunResult<ClassifierOutput>> {
    const categories = await prisma.managementCategory.findMany({
      where: { companyId: input.companyId, isActive: true, ruleHints: { not: null } },
    });

    const uncategorized = await prisma.financialEvent.findMany({
      where: { companyId: input.companyId, managementCategoryId: null, isDuplicate: false },
    });

    let classified = 0;
    let needsReview = 0;
    const warnings: AgentRunResult<ClassifierOutput>["warnings"] = [];

    for (const event of uncategorized) {
      const description = (event.normalizedDescription ?? event.originalDescription ?? "").toUpperCase();
      const match = categories.find((c) => c.ruleHints && matchesHints(description, c.ruleHints));

      if (match) {
        await prisma.financialEvent.update({
          where: { id: event.id },
          data: { managementCategoryId: match.id, needsReview: false },
        });
        classified++;
      } else {
        await prisma.financialEvent.update({ where: { id: event.id }, data: { needsReview: true } });
        needsReview++;
      }
    }

    if (needsReview > 0) {
      warnings.push({
        code: "UNCLASSIFIED_EVENTS",
        message: `${needsReview} evento(s) sem categoria correspondente — revisão manual necessária.`,
      });
    }

    const total = classified + needsReview;
    const confidence = total > 0 ? classified / total : 1;

    return {
      output: { classified, needsReview },
      confidence,
      warnings,
      errors: [],
      ruleBasedMode: true,
    };
  }
}
