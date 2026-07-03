/**
 * DeduplicatorAgent — aplica DedupService sobre eventos financeiros já
 * persistidos de uma empresa, marcando pares suspeitos de duplicidade.
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { detectDuplicates, type DuplicateMatch } from "@/lib/dedup-service";
import { prisma } from "@/lib/prisma";

export type DeduplicatorInput = { companyId: string };
export type DeduplicatorOutput = { matches: DuplicateMatch[] };

export class DeduplicatorAgent extends BaseAgent<DeduplicatorInput, DeduplicatorOutput> {
  readonly name = "DeduplicatorAgent";
  readonly version = "1.0.0";
  readonly description = "Detecta eventos financeiros potencialmente duplicados.";

  protected async execute(input: DeduplicatorInput): Promise<AgentRunResult<DeduplicatorOutput>> {
    const events = await prisma.financialEvent.findMany({
      where: { companyId: input.companyId, isDuplicate: false },
      select: { id: true, netAmount: true, financialDate: true, counterpartyName: true, sourceId: true },
    });

    const candidates = events
      .filter((e) => e.financialDate)
      .map((e) => ({
        id: e.id,
        amount: Number(e.netAmount),
        date: e.financialDate!.toISOString().slice(0, 10),
        counterparty: e.counterpartyName,
        documentRef: e.sourceId,
      }));

    const matches = detectDuplicates(candidates);

    if (matches.length > 0) {
      await prisma.$transaction(
        matches.map((m) =>
          prisma.financialEvent.update({
            where: { id: m.id },
            data: { isDuplicate: true, duplicateOfId: m.duplicateOfId, needsReview: true },
          })
        )
      );
    }

    return {
      output: { matches },
      confidence: 0.75,
      warnings: matches.map((m) => ({
        code: "DUPLICATE_FOUND",
        message: `Possível duplicata: ${m.id} de ${m.duplicateOfId} (${m.reason})`,
      })),
      errors: [],
      ruleBasedMode: true,
    };
  }
}
