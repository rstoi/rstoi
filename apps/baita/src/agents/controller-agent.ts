/**
 * ControllerAgent — acompanha pendências, ciclos e gera alertas
 * consolidados (recomendações e decisões atrasadas, eventos pendentes de
 * revisão, riscos de forecast).
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { prisma } from "@/lib/prisma";

export type ControllerInput = { companyId: string };
export type ControllerAlert = { severity: "LOW" | "MEDIUM" | "HIGH"; message: string };
export type ControllerOutput = { alerts: ControllerAlert[] };

export class ControllerAgent extends BaseAgent<ControllerInput, ControllerOutput> {
  readonly name = "ControllerAgent";
  readonly version = "1.0.0";
  readonly description = "Acompanha pendências, ciclos e gera alertas consolidados.";

  protected async execute(input: ControllerInput): Promise<AgentRunResult<ControllerOutput>> {
    const now = new Date();
    const [overdueRecommendations, overdueDecisions, needsReviewEvents, overduePayables] = await Promise.all([
      prisma.recommendation.count({
        where: { companyId: input.companyId, status: { in: ["OPEN", "IN_PROGRESS"] }, deadline: { lt: now } },
      }),
      prisma.decision.count({
        where: { companyId: input.companyId, status: "PLANNED", deadline: { lt: now } },
      }),
      prisma.financialEvent.count({ where: { companyId: input.companyId, needsReview: true } }),
      prisma.payable.count({ where: { companyId: input.companyId, status: "OVERDUE" } }),
    ]);

    const alerts: ControllerOutput["alerts"] = [];
    if (overdueRecommendations > 0) {
      alerts.push({
        severity: "HIGH",
        message: `${overdueRecommendations} recomendação(ões) com prazo vencido sem execução.`,
      });
    }
    if (overdueDecisions > 0) {
      alerts.push({ severity: "HIGH", message: `${overdueDecisions} decisão(ões) planejada(s) com prazo vencido.` });
    }
    if (needsReviewEvents > 0) {
      alerts.push({
        severity: "MEDIUM",
        message: `${needsReviewEvents} evento(s) financeiro(s) aguardando revisão manual.`,
      });
    }
    if (overduePayables > 0) {
      alerts.push({ severity: "HIGH", message: `${overduePayables} conta(s) a pagar vencida(s).` });
    }

    const confidence = alerts.length === 0 ? 0.9 : 0.6;

    return {
      output: { alerts },
      confidence,
      warnings: alerts.map((a) => ({ code: "CONTROLLER_ALERT", message: a.message })),
      errors: [],
      ruleBasedMode: true,
    };
  }
}
