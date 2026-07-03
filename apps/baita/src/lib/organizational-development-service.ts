/**
 * OrganizationalDevelopmentService — estágio de ciclo de vida (Adizes) e
 * escada de maturidade de sistemas gerenciais (níveis 0 a 5).
 */
import type { AdizesLifecycleStage } from "@prisma/client";

export type AdizesProfile = {
  label: string;
  typicalRisks: string[];
  financialFocus: string[];
  prioritySystems: string[];
  adequateGovernance: string;
  humanInteractionType: string;
  nextSteps: string[];
};

export const ADIZES_PROFILES: Record<AdizesLifecycleStage, AdizesProfile> = {
  COURTSHIP: {
    label: "Namoro",
    typicalRisks: ["Ideia sem validação de mercado", "Falta de compromisso formal dos sócios"],
    financialFocus: ["Viabilidade financeira do modelo", "Estimativa de investimento inicial"],
    prioritySystems: ["Plano de negócio mínimo", "Registro de premissas"],
    adequateGovernance: "Acordo entre sócios sobre papéis e aportes.",
    humanInteractionType: "Conversas exploratórias, validação de compromisso.",
    nextSteps: ["Formalizar sociedade", "Validar primeiras vendas"],
  },
  INFANCY: {
    label: "Infância",
    typicalRisks: ["Caixa curto", "Dependência do fundador", "Ausência de controles mínimos"],
    financialFocus: ["Caixa diário", "Sobrevivência", "Disciplina mínima de cobrança e pagamento"],
    prioritySystems: ["Controle de caixa diário", "Contas a pagar/receber básico"],
    adequateGovernance: "Decisão centralizada no fundador, sem burocracia excessiva.",
    humanInteractionType: "Direta, frequente, orientada a sobrevivência.",
    nextSteps: ["Implantar Nível 0 da escada de maturidade", "Registrar decisões básicas"],
  },
  GO_GO: {
    label: "Toca-toca",
    typicalRisks: ["Crescimento sem controle de margem", "Capital de giro estourado", "Diversificação excessiva"],
    financialFocus: ["Margem por cliente/projeto", "Capital de giro", "Controle do crescimento"],
    prioritySystems: ["DRE gerencial", "Fluxo de caixa 30 dias", "Aging de recebíveis"],
    adequateGovernance: "Início de delegação, ainda com forte presença do fundador.",
    humanInteractionType: "Cadência semanal, foco em prioridades e corte de dispersão.",
    nextSteps: ["Implantar Nível 1 da escada de maturidade", "Formalizar papéis mínimos"],
  },
  ADOLESCENCE: {
    label: "Adolescência",
    typicalRisks: ["Conflito entre fundadores e gestores contratados", "Falta de papéis e alçadas claras"],
    financialFocus: ["Governança financeira", "Profissionalização da gestão"],
    prioritySystems: ["Papéis e alçadas", "Comitê financeiro", "Rituais formais"],
    adequateGovernance: "Transição de gestão centralizada para colegiada, com atritos esperados.",
    humanInteractionType: "Mediação de conflitos, formalização de combinados.",
    nextSteps: ["Implantar Nível 2/3 da escada de maturidade", "Criar rituais de governança"],
  },
  PRIME: {
    label: "Plenitude",
    typicalRisks: ["Acomodação inicial", "Perda de agilidade se burocratizar demais"],
    financialFocus: ["Forecast calibrado", "Eficiência", "Alocação de capital"],
    prioritySystems: ["Backtesting", "Benchmarking", "BI e margem por cliente"],
    adequateGovernance: "Papéis claros com agilidade preservada.",
    humanInteractionType: "Estratégica, orientada a alocação de capital e eficiência.",
    nextSteps: ["Implantar Nível 4 da escada de maturidade", "Sustentar backtesting contínuo"],
  },
  STABILITY: {
    label: "Estabilidade",
    typicalRisks: ["Acomodação", "Perda gradual de inovação"],
    financialFocus: ["Produtividade", "Alerta contra acomodação"],
    prioritySystems: ["Indicadores de produtividade", "Revisão estratégica trimestral"],
    adequateGovernance: "Manter rituais ativos, evitar rotina sem questionamento.",
    humanInteractionType: "Provocativa, questionando status quo.",
    nextSteps: ["Reforçar inovação", "Revisitar estratégia de crescimento"],
  },
  ARISTOCRACY: {
    label: "Aristocracia",
    typicalRisks: ["Forma sobre substância", "Aversão a risco excessiva", "Decisões lentas"],
    financialFocus: ["Decisão real baseada em dados", "Eficiência de capital"],
    prioritySystems: ["Confronto diplomático com dados", "Simplificação de processos"],
    adequateGovernance: "Reduzir formalismo sem substância, acelerar decisão.",
    humanInteractionType: "Confronto respeitoso, baseado em evidência.",
    nextSteps: ["Simplificar rituais", "Reengajar liderança com dados de mercado"],
  },
  EARLY_BUREAUCRACY: {
    label: "Burocracia inicial",
    typicalRisks: ["Conflito interno crescente", "Foco em disputa interna, não em cliente"],
    financialFocus: ["Simplificação", "Accountability", "Redução de tempo de decisão"],
    prioritySystems: ["Revisão de processos redundantes", "Clareza de responsabilidades"],
    adequateGovernance: "Reestruturar papéis e reduzir camadas de decisão.",
    humanInteractionType: "Direta, focada em accountability individual.",
    nextSteps: ["Simplificar estrutura", "Reduzir tempo médio de decisão"],
  },
  BUREAUCRACY: {
    label: "Burocracia",
    typicalRisks: ["Desconexão do mercado", "Processos sem dono", "Alto tempo de decisão"],
    financialFocus: ["Simplificação", "Accountability", "Tempo de decisão"],
    prioritySystems: ["Revisão radical de processos", "Reconexão com cliente"],
    adequateGovernance: "Intervenção ativa para reduzir burocracia sem substância.",
    humanInteractionType: "Direta, com urgência de mudança.",
    nextSteps: ["Plano de simplificação urgente", "Reconectar decisão a resultado"],
  },
  DEATH: {
    label: "Morte organizacional",
    typicalRisks: ["Perda irreversível de relevância", "Encerramento de operações"],
    financialFocus: ["Preservação de valor residual", "Encerramento ordenado"],
    prioritySystems: ["Plano de encerramento ou reestruturação profunda"],
    adequateGovernance: "Decisão sobre continuidade, reestruturação ou encerramento.",
    humanInteractionType: "Direta, transparente sobre cenários possíveis.",
    nextSteps: ["Avaliar viabilidade de reestruturação", "Planejar encerramento ordenado se inevitável"],
  },
  UNKNOWN: {
    label: "Não avaliado",
    typicalRisks: ["Diagnóstico ainda não realizado"],
    financialFocus: ["Levantamento inicial de caixa e DRE"],
    prioritySystems: ["Ciclo 0 — mapa de fontes e escopo"],
    adequateGovernance: "A definir após diagnóstico inicial.",
    humanInteractionType: "Levantamento exploratório.",
    nextSteps: ["Concluir diagnóstico de estágio Adizes"],
  },
};

export type ManagementSystemLevel = {
  level: number;
  name: string;
  systems: string[];
};

export const MANAGEMENT_LEVELS: ManagementSystemLevel[] = [
  {
    level: 0,
    name: "Sobrevivência e visibilidade mínima",
    systems: ["Caixa diário", "Contas a pagar", "Contas a receber", "Agenda de obrigações", "Registro de decisões"],
  },
  {
    level: 1,
    name: "Controle gerencial básico",
    systems: ["Plano de contas", "DRE", "Fluxo 30 dias", "Aging", "Relatório mensal"],
  },
  {
    level: 2,
    name: "Gestão por resultados",
    systems: ["OKRs", "Dashboards", "Rituais", "Forecast semanal", "Plano de ação"],
  },
  {
    level: 3,
    name: "Governança funcional",
    systems: ["Papéis", "Alçadas", "Comitê financeiro", "Comitê comercial/projetos", "PMO", "Riscos"],
  },
  {
    level: 4,
    name: "Sistema integrado",
    systems: ["ERP disciplinado", "CRM integrado", "BI", "Margem por cliente/projeto", "Backtesting", "Benchmarking"],
  },
  {
    level: 5,
    name: "Organização aprendente",
    systems: [
      "PDCA institucional",
      "OODA",
      "DMAIC",
      "Gestão do conhecimento",
      "Desenvolvimento de lideranças",
      "Governança adaptativa",
    ],
  },
];

/**
 * Sugere o próximo nível mínimo viável, evitando saltar etapas (burocracia
 * prematura) mesmo quando a empresa tem recursos para "pular" níveis.
 */
export function suggestNextManagementLevel(currentLevel: number): ManagementSystemLevel {
  const next = Math.min(currentLevel + 1, MANAGEMENT_LEVELS.length - 1);
  return MANAGEMENT_LEVELS[next];
}

export function getAdizesProfile(stage: AdizesLifecycleStage): AdizesProfile {
  return ADIZES_PROFILES[stage];
}
