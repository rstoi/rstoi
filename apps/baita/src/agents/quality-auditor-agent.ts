/**
 * QualityAuditorAgent — atribui rating de confiabilidade aos eventos
 * financeiros com base nas evidências disponíveis (fonte, conciliação),
 * usando o RatingService como fonte única de verdade dos critérios.
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { calculateReliabilityRating } from "@/lib/rating-service";
import { prisma } from "@/lib/prisma";

export type QualityAuditorInput = { companyId: string };
export type QualityAuditorOutput = {
  evaluated: number;
  distribution: Record<string, number>;
};

const STRONG_SOURCES = ["BANK_STATEMENT", "GOVERNMENT_DECLARATION", "ACCOUNTING_BOOK"] as const;
const INFORMAL_SOURCES = ["MESSAGING", "EMAIL"] as const;

export class QualityAuditorAgent extends BaseAgent<QualityAuditorInput, QualityAuditorOutput> {
  readonly name = "QualityAuditorAgent";
  readonly version = "1.0.0";
  readonly description = "Atribui ratings de confiabilidade e identifica lacunas de evidência.";

  protected async execute(input: QualityAuditorInput): Promise<AgentRunResult<QualityAuditorOutput>> {
    const events = await prisma.financialEvent.findMany({
      where: { companyId: input.companyId, isDuplicate: false },
      include: {
        primaryReconciliations: true,
        relatedReconciliations: true,
      },
    });

    const distribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, UNKNOWN: 0 };

    for (const event of events) {
      const reconciliations = [...event.primaryReconciliations, ...event.relatedReconciliations];
      const hasMatchedReconciliation = reconciliations.some((r) => r.status === "MATCHED");
      const hasDivergentReconciliation = reconciliations.some((r) => r.status === "DIVERGENT");
      const isStrongSource = (STRONG_SOURCES as readonly string[]).includes(event.sourceType);
      const isInformalSource = (INFORMAL_SOURCES as readonly string[]).includes(event.sourceType);

      const result = calculateReliabilityRating({
        bankStatementMatchesDocument: hasMatchedReconciliation && event.sourceType === "BANK_STATEMENT",
        invoiceReconciledWithReceipt: hasMatchedReconciliation && event.sourceType === "ISSUED_INVOICE",
        bankStatementClearlyIdentified: event.sourceType === "BANK_STATEMENT" && !hasDivergentReconciliation,
        invoiceIssuedWithoutReceipt: event.sourceType === "ISSUED_INVOICE" && !hasMatchedReconciliation,
        erpWithoutReconciliation: event.sourceType === "ERP" && !hasMatchedReconciliation,
        emailWithBoletoNoPayment: event.sourceType === "EMAIL" && !hasMatchedReconciliation,
        coherentOperationalNoStrongDocument: !isStrongSource && !isInformalSource && !hasMatchedReconciliation,
        informalChannel: isInformalSource,
        divergentWithoutProof: hasDivergentReconciliation,
        strongSourceCount: isStrongSource && hasMatchedReconciliation ? 2 : isStrongSource ? 1 : 0,
      });

      await prisma.financialEvent.update({
        where: { id: event.id },
        data: { reliabilityRating: result.rating, qualityRating: result.rating },
      });

      distribution[result.rating]++;
    }

    const warnings: AgentRunResult<QualityAuditorOutput>["warnings"] = [];
    if (distribution.D + distribution.E > 0) {
      warnings.push({
        code: "LOW_RELIABILITY_EVENTS",
        message: `${distribution.D + distribution.E} evento(s) com rating D/E — evitar uso em decisões críticas.`,
      });
    }

    const total = events.length || 1;
    const confidence = (distribution.A + distribution.B) / total;

    return {
      output: { evaluated: events.length, distribution },
      confidence,
      warnings,
      errors: [],
      ruleBasedMode: true,
    };
  }
}
