/**
 * ReconciliationAgent — cruza eventos de fontes diferentes (ex.: banco x
 * notas fiscais) usando ReconciliationService e persiste os resultados como
 * registros de Reconciliation.
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { matchReconciliation } from "@/lib/reconciliation-service";
import { prisma } from "@/lib/prisma";
import type { DataSourceType, ReconciliationType } from "@prisma/client";

export type ReconciliationInput = {
  companyId: string;
  primarySourceType: DataSourceType;
  relatedSourceType: DataSourceType;
  reconciliationType: ReconciliationType;
};

export type ReconciliationOutput = {
  matched: number;
  divergent: number;
};

export class ReconciliationAgent extends BaseAgent<ReconciliationInput, ReconciliationOutput> {
  readonly name = "ReconciliationAgent";
  readonly version = "1.0.0";
  readonly description = "Cruza eventos entre fontes para identificar correspondências e divergências.";

  protected async execute(input: ReconciliationInput): Promise<AgentRunResult<ReconciliationOutput>> {
    const [primaryEvents, relatedEvents] = await Promise.all([
      prisma.financialEvent.findMany({
        where: { companyId: input.companyId, sourceType: input.primarySourceType, isDuplicate: false },
      }),
      prisma.financialEvent.findMany({
        where: { companyId: input.companyId, sourceType: input.relatedSourceType, isDuplicate: false },
      }),
    ]);

    const toCandidates = (events: typeof primaryEvents) =>
      events
        .filter((e) => e.financialDate)
        .map((e) => ({
          id: e.id,
          amount: Number(e.netAmount),
          date: e.financialDate!.toISOString().slice(0, 10),
          counterparty: e.counterpartyName,
        }));

    const matches = matchReconciliation(toCandidates(primaryEvents), toCandidates(relatedEvents));

    for (const match of matches) {
      await prisma.reconciliation.create({
        data: {
          companyId: input.companyId,
          primaryEventId: match.primaryId,
          relatedEventId: match.relatedId,
          reconciliationType: input.reconciliationType,
          divergenceAmount: match.divergenceAmount,
          status: match.status,
          reliabilityRating: match.status === "MATCHED" ? "A" : "C",
        },
      });
    }

    const matched = matches.filter((m) => m.status === "MATCHED").length;
    const divergent = matches.filter((m) => m.status === "DIVERGENT").length;

    return {
      output: { matched, divergent },
      confidence: matches.length > 0 ? matched / matches.length : 0.5,
      warnings:
        divergent > 0
          ? [{ code: "DIVERGENCES_FOUND", message: `${divergent} divergência(s) encontradas na conciliação.` }]
          : [],
      errors: [],
      ruleBasedMode: true,
    };
  }
}
