/**
 * OrchestratorAgent — inicia ciclos de implantação, verifica fontes
 * disponíveis/pendentes e consolida quais agentes devem ser acionados a
 * seguir. Não substitui os agentes especializados: apenas decide a ordem.
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { prisma } from "@/lib/prisma";
import type { CycleStage } from "@prisma/client";

export type OrchestratorInput = { companyId: string };

export type OrchestratorOutput = {
  currentCycle: CycleStage | null;
  pendingCycles: CycleStage[];
  nextActions: string[];
  blockingIssues: string[];
};

const CYCLE_ORDER: CycleStage[] = [
  "CYCLE_0_SCOPE",
  "CYCLE_1_CASH",
  "CYCLE_2_DRE",
  "CYCLE_3_FINANCIAL_POSITION",
  "CYCLE_4_FORECAST",
  "CYCLE_5_RECONCILIATION",
  "CYCLE_6_BACKTESTING",
  "RECURRING",
];

const CYCLE_ACTIONS: Record<CycleStage, string> = {
  CYCLE_0_SCOPE: "Mapear fontes disponíveis e responsáveis (CollectorAgent).",
  CYCLE_1_CASH: "Extrair e normalizar extratos bancários (ExtractorAgent + NormalizerAgent).",
  CYCLE_2_DRE: "Classificar eventos e gerar DRE gerencial inicial (ClassifierAgent + DREAgent).",
  CYCLE_3_FINANCIAL_POSITION: "Calcular situação financeira atual (TreasuryAgent).",
  CYCLE_4_FORECAST: "Gerar forecast 30 dias e mensal (ForecastAgent).",
  CYCLE_5_RECONCILIATION: "Ampliar conciliação entre fontes (ReconciliationAgent).",
  CYCLE_6_BACKTESTING: "Rodar backtesting e calibrar premissas (BacktestingAgent).",
  RECURRING: "Executar ciclo recorrente: fechamento mensal, tesouraria semanal, revisão trimestral.",
};

export class OrchestratorAgent extends BaseAgent<OrchestratorInput, OrchestratorOutput> {
  readonly name = "OrchestratorAgent";
  readonly version = "1.0.0";
  readonly description = "Inicia ciclos, verifica fontes e consolida próximos passos.";

  protected async execute(input: OrchestratorInput): Promise<AgentRunResult<OrchestratorOutput>> {
    const cycles = await prisma.implementationCycle.findMany({ where: { companyId: input.companyId } });
    const cycleByStage = new Map(cycles.map((c) => [c.stage, c]));

    const pendingCycles = CYCLE_ORDER.filter((stage) => {
      const cycle = cycleByStage.get(stage);
      return !cycle || cycle.status !== "DONE";
    });

    const currentCycle = pendingCycles[0] ?? null;

    const dataSources = await prisma.dataSource.count({ where: { companyId: input.companyId } });
    const blockingIssues: string[] = [];
    if (dataSources === 0) {
      blockingIssues.push("Nenhuma fonte de dados cadastrada — cadastre fontes mínimas antes de avançar.");
    }

    const nextActions = currentCycle ? [CYCLE_ACTIONS[currentCycle]] : ["Todos os ciclos concluídos — manter ciclo recorrente."];

    return {
      output: { currentCycle, pendingCycles, nextActions, blockingIssues },
      confidence: dataSources > 0 ? 0.9 : 0.4,
      warnings: blockingIssues.map((message) => ({ code: "NO_SOURCES", message })),
      errors: [],
      ruleBasedMode: true,
    };
  }
}
