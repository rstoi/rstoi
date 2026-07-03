/**
 * DirectorEvaluationAgent — persiste uma avaliação da diretoria nas oito
 * dimensões de governança, a partir de notas por critério (1 a 5) informadas
 * por consultor/analista.
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { evaluateDirector, type CriterionScore } from "@/lib/director-evaluation-service";
import { prisma } from "@/lib/prisma";

export type DirectorEvaluationInput = {
  companyId: string;
  periodStart: Date;
  periodEnd: Date;
  scores: CriterionScore[];
  notes?: string;
};

export type DirectorEvaluationOutput = {
  evaluationId: string;
  totalScore: number;
};

const DIMENSION_FIELD_MAP = {
  STRATEGIC_LEADERSHIP: "strategicLeadershipScore",
  EXECUTION_DISCIPLINE: "executionDisciplineScore",
  GOVERNANCE_ROLES: "governanceScore",
  FINANCIAL_MANAGEMENT: "financialManagementScore",
  COOPERATION_MATURITY: "cooperationScore",
  COMMERCIAL_GROWTH: "commercialGrowthScore",
  SYSTEMS_PROCESSES: "systemsProcessesScore",
  LEARNING_DEVELOPMENT: "learningDevelopmentScore",
} as const;

export class DirectorEvaluationAgent extends BaseAgent<DirectorEvaluationInput, DirectorEvaluationOutput> {
  readonly name = "DirectorEvaluationAgent";
  readonly version = "1.0.0";
  readonly description = "Avalia a maturidade da diretoria nas oito dimensões de governança.";

  protected async execute(input: DirectorEvaluationInput): Promise<AgentRunResult<DirectorEvaluationOutput>> {
    const result = evaluateDirector(input.scores);

    const evaluation = await prisma.directorEvaluation.create({
      data: {
        companyId: input.companyId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        strategicLeadershipScore: result.dimensionScores.STRATEGIC_LEADERSHIP,
        executionDisciplineScore: result.dimensionScores.EXECUTION_DISCIPLINE,
        governanceScore: result.dimensionScores.GOVERNANCE_ROLES,
        financialManagementScore: result.dimensionScores.FINANCIAL_MANAGEMENT,
        cooperationScore: result.dimensionScores.COOPERATION_MATURITY,
        commercialGrowthScore: result.dimensionScores.COMMERCIAL_GROWTH,
        systemsProcessesScore: result.dimensionScores.SYSTEMS_PROCESSES,
        learningDevelopmentScore: result.dimensionScores.LEARNING_DEVELOPMENT,
        totalScore: result.totalScore,
        notes: input.notes,
        items: {
          create: input.scores.map((s) => ({
            dimension: s.dimension,
            criterion: s.criterion,
            score: s.score,
            evidenceNotes: s.evidenceNotes,
            recommendation: result.recommendations.find((r) => r.dimension === s.dimension)?.recommendation,
          })),
        },
      },
    });

    void DIMENSION_FIELD_MAP; // mapa documental — mantém rastreabilidade entre dimensão e campo persistido

    return {
      output: { evaluationId: evaluation.id, totalScore: result.totalScore },
      confidence: input.scores.length >= 20 ? 0.9 : 0.6,
      warnings:
        input.scores.length < 20
          ? [{ code: "PARTIAL_EVALUATION", message: "Avaliação com número reduzido de critérios pontuados." }]
          : [],
      errors: [],
      ruleBasedMode: true,
    };
  }
}
