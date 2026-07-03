/**
 * DirectorEvaluationService — avaliação de maturidade da diretoria nas oito
 * dimensões de governança. Cada critério recebe nota de 1 a 5; o score da
 * dimensão é a média dos critérios, e o score geral é a média das dimensões.
 */

export type EvaluationDimensionKey =
  | "STRATEGIC_LEADERSHIP"
  | "EXECUTION_DISCIPLINE"
  | "GOVERNANCE_ROLES"
  | "FINANCIAL_MANAGEMENT"
  | "COOPERATION_MATURITY"
  | "COMMERCIAL_GROWTH"
  | "SYSTEMS_PROCESSES"
  | "LEARNING_DEVELOPMENT";

export const DIMENSION_LABELS: Record<EvaluationDimensionKey, string> = {
  STRATEGIC_LEADERSHIP: "Liderança estratégica e propósito",
  EXECUTION_DISCIPLINE: "Execução com disciplina",
  GOVERNANCE_ROLES: "Governança e papéis",
  FINANCIAL_MANAGEMENT: "Gestão financeira",
  COOPERATION_MATURITY: "Cooperação e maturidade relacional",
  COMMERCIAL_GROWTH: "Gestão comercial e crescimento",
  SYSTEMS_PROCESSES: "Sistemas e processos",
  LEARNING_DEVELOPMENT: "Aprendizado e desenvolvimento",
};

export const DIMENSION_CRITERIA: Record<EvaluationDimensionKey, string[]> = {
  STRATEGIC_LEADERSHIP: [
    "Clareza de prioridades",
    "Alinhamento de decisões",
    "Comunicação da visão",
    "Previsibilidade decisória",
  ],
  EXECUTION_DISCIPLINE: [
    "OKRs atingidos",
    "Iniciativas implementadas",
    "Rituais cumpridos",
    "Obstáculos removidos",
  ],
  GOVERNANCE_ROLES: ["Rituais formais", "Atas", "Clareza de papéis", "Alçadas", "Gestão colegiada"],
  FINANCIAL_MANAGEMENT: [
    "DRE confiável",
    "Fluxo de caixa",
    "Forecast",
    "Erro previsto x realizado",
    "Dívida e capital de giro",
  ],
  COOPERATION_MATURITY: [
    "Divergências produtivas",
    "Ausência de decisões paralelas",
    "Comunicação institucional",
    "Conflitos encaminhados",
  ],
  COMMERCIAL_GROWTH: [
    "Pipeline",
    "Taxa de conversão",
    "Receita recorrente",
    "Margem por cliente/projeto",
    "Posicionamento",
  ],
  SYSTEMS_PROCESSES: ["ERP/CRM/PMO", "Documentação", "Repetibilidade", "Redução de improviso"],
  LEARNING_DEVELOPMENT: [
    "PDCA",
    "Feedback",
    "Desenvolvimento de pessoas",
    "Sucessão",
    "Melhoria contínua",
  ],
};

export type CriterionScore = {
  dimension: EvaluationDimensionKey;
  criterion: string;
  score: number; // 1 a 5
  evidenceNotes?: string;
};

export type DimensionScoreResult = {
  dimension: EvaluationDimensionKey;
  label: string;
  score: number;
  recommendation: string;
};

export type DirectorEvaluationResult = {
  dimensionScores: Record<EvaluationDimensionKey, number>;
  totalScore: number;
  recommendations: DimensionScoreResult[];
};

const DIMENSION_RECOMMENDATIONS: Record<EvaluationDimensionKey, (score: number) => string> = {
  STRATEGIC_LEADERSHIP: (s) =>
    s < 3
      ? "Formalizar prioridades trimestrais e comunicar a visão de forma recorrente à liderança."
      : "Manter cadência de comunicação da visão e revisar prioridades a cada ciclo.",
  EXECUTION_DISCIPLINE: (s) =>
    s < 3
      ? "Instituir rituais de acompanhamento de OKRs com donos e prazos claros."
      : "Sustentar disciplina de execução e revisar obstáculos recorrentes.",
  GOVERNANCE_ROLES: (s) =>
    s < 3
      ? "Formalizar papéis, alçadas e atas de reunião como pré-requisito de governança mínima."
      : "Consolidar rituais formais já existentes e revisar alçadas periodicamente.",
  FINANCIAL_MANAGEMENT: (s) =>
    s < 3
      ? "Priorizar confiabilidade do DRE e do fluxo de caixa antes de avançar em outras dimensões."
      : "Investir em calibração do forecast via backtesting contínuo.",
  COOPERATION_MATURITY: (s) =>
    s < 3
      ? "Criar espaço estruturado para divergências e eliminar decisões paralelas fora dos rituais."
      : "Manter comunicação institucional e monitorar sinais de conflito não encaminhado.",
  COMMERCIAL_GROWTH: (s) =>
    s < 3
      ? "Estruturar pipeline comercial e margem por cliente/projeto como indicador de gestão."
      : "Aprofundar análise de margem por cliente/projeto para sustentar crescimento saudável.",
  SYSTEMS_PROCESSES: (s) =>
    s < 3
      ? "Reduzir dependência de improviso implantando sistemas mínimos (ERP/CRM/PMO)."
      : "Evoluir documentação e repetibilidade dos processos já sistematizados.",
  LEARNING_DEVELOPMENT: (s) =>
    s < 3
      ? "Instituir PDCA institucional e plano de sucessão mínimo."
      : "Aprofundar desenvolvimento de lideranças e gestão do conhecimento.",
};

export function scoreDimension(scores: CriterionScore[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
}

export function evaluateDirector(allScores: CriterionScore[]): DirectorEvaluationResult {
  const dimensionKeys = Object.keys(DIMENSION_LABELS) as EvaluationDimensionKey[];
  const dimensionScores = {} as Record<EvaluationDimensionKey, number>;
  const recommendations: DimensionScoreResult[] = [];

  for (const dimension of dimensionKeys) {
    const criteriaScores = allScores.filter((s) => s.dimension === dimension);
    const score = scoreDimension(criteriaScores);
    dimensionScores[dimension] = score;
    recommendations.push({
      dimension,
      label: DIMENSION_LABELS[dimension],
      score,
      recommendation: DIMENSION_RECOMMENDATIONS[dimension](score),
    });
  }

  const totalScore =
    dimensionKeys.reduce((sum, key) => sum + dimensionScores[key], 0) / dimensionKeys.length;

  return { dimensionScores, totalScore, recommendations };
}
