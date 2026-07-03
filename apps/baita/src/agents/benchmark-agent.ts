/**
 * BenchmarkAgent — no MVP, estrutura benchmarks cadastrados manualmente
 * (via notas em ManagementCategory/DRE) e compara indicadores da empresa
 * contra faixas de referência por setor informadas manualmente.
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";

export type BenchmarkInput = {
  industry: string;
  contributionMarginPercent: number;
  ebitdaMarginPercent: number;
};

export type BenchmarkOutput = {
  comparisons: { indicator: string; company: number; referenceRange: string; assessment: string }[];
};

// Faixas de referência ilustrativas para MVP — devem evoluir para benchmarks
// reais cadastrados por setor pelo consultor Baita.
const REFERENCE_RANGES: Record<string, { contributionMargin: [number, number]; ebitdaMargin: [number, number] }> = {
  default: { contributionMargin: [0.35, 0.55], ebitdaMargin: [0.08, 0.18] },
  "engenharia e automação": { contributionMargin: [0.4, 0.6], ebitdaMargin: [0.1, 0.2] },
  consultoria: { contributionMargin: [0.5, 0.7], ebitdaMargin: [0.15, 0.25] },
};

function assess(value: number, range: [number, number]): string {
  if (value < range[0]) return "Abaixo da referência do setor.";
  if (value > range[1]) return "Acima da referência do setor.";
  return "Dentro da referência do setor.";
}

export class BenchmarkAgent extends BaseAgent<BenchmarkInput, BenchmarkOutput> {
  readonly name = "BenchmarkAgent";
  readonly version = "1.0.0";
  readonly description = "Compara indicadores da empresa contra benchmarks cadastrados manualmente.";

  protected async execute(input: BenchmarkInput): Promise<AgentRunResult<BenchmarkOutput>> {
    const key = input.industry.toLowerCase().trim();
    const reference = REFERENCE_RANGES[key] ?? REFERENCE_RANGES.default;

    const comparisons = [
      {
        indicator: "Margem de contribuição",
        company: input.contributionMarginPercent,
        referenceRange: `${(reference.contributionMargin[0] * 100).toFixed(0)}% a ${(reference.contributionMargin[1] * 100).toFixed(0)}%`,
        assessment: assess(input.contributionMarginPercent, reference.contributionMargin),
      },
      {
        indicator: "Margem EBITDA",
        company: input.ebitdaMarginPercent,
        referenceRange: `${(reference.ebitdaMargin[0] * 100).toFixed(0)}% a ${(reference.ebitdaMargin[1] * 100).toFixed(0)}%`,
        assessment: assess(input.ebitdaMarginPercent, reference.ebitdaMargin),
      },
    ];

    return {
      output: { comparisons },
      confidence: reference === REFERENCE_RANGES.default ? 0.4 : 0.6,
      warnings:
        key in REFERENCE_RANGES
          ? []
          : [{ code: "GENERIC_BENCHMARK", message: "Setor sem benchmark específico — usando faixa genérica." }],
      errors: [],
      ruleBasedMode: true,
    };
  }
}
