/**
 * CollectorAgent — mapeia fontes de dados disponíveis e pendências,
 * comparando com o checklist mínimo recomendado no onboarding.
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { prisma } from "@/lib/prisma";
import type { DataSourceType } from "@prisma/client";

export type CollectorInput = { companyId: string };

export type CollectorOutput = {
  available: { type: DataSourceType; name: string; accessStatus: string }[];
  missingRecommended: string[];
};

export const MINIMUM_CHECKLIST: { type: DataSourceType; label: string }[] = [
  { type: "BANK_STATEMENT", label: "Extratos bancários (6 a 12 meses)" },
  { type: "ISSUED_INVOICE", label: "Notas fiscais emitidas" },
  { type: "RECEIVED_INVOICE", label: "Notas fiscais recebidas" },
  { type: "SPREADSHEET", label: "Contas a pagar" },
  { type: "SPREADSHEET", label: "Contas a receber" },
  { type: "CREDIT_BUREAU", label: "Relatório de dívidas" },
  { type: "TAX", label: "Guias fiscais" },
  { type: "ACCOUNTING_BOOK", label: "Balancete, se houver" },
  { type: "CONTRACT", label: "Contratos relevantes" },
  { type: "CLOUD_FILE", label: "Acesso a Drive/Gmail, se autorizado" },
];

export class CollectorAgent extends BaseAgent<CollectorInput, CollectorOutput> {
  readonly name = "CollectorAgent";
  readonly version = "1.0.0";
  readonly description = "Mapeia fontes disponíveis e pendências frente ao checklist mínimo.";

  protected async execute(input: CollectorInput): Promise<AgentRunResult<CollectorOutput>> {
    const sources = await prisma.dataSource.findMany({ where: { companyId: input.companyId } });
    const availableTypes = new Set(sources.map((s) => s.type));

    const missingRecommended = MINIMUM_CHECKLIST.filter((item) => !availableTypes.has(item.type)).map(
      (item) => item.label
    );

    return {
      output: {
        available: sources.map((s) => ({ type: s.type, name: s.name, accessStatus: s.accessStatus })),
        missingRecommended,
      },
      confidence: sources.length > 0 ? 0.8 : 0.3,
      warnings: missingRecommended.map((label) => ({ code: "MISSING_SOURCE", message: `Fonte recomendada ausente: ${label}` })),
      errors: [],
      ruleBasedMode: true,
    };
  }
}
