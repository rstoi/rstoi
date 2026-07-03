/**
 * BacktestingService — compara previsto x realizado, calcula erro absoluto,
 * percentual e viés (otimista/pessimista), e sugere ajustes de premissas.
 */

export type BacktestingPair = {
  date: string;
  category: string;
  predictedAmount: number;
  actualAmount: number;
};

export type BacktestingLineResult = BacktestingPair & {
  absoluteError: number;
  percentageError: number;
  cause: string;
  adjustmentRecommendation: string;
};

export type BacktestingSummary = {
  totalAbsoluteError: number;
  totalPercentageError: number;
  bias: "OTIMISTA" | "PESSIMISTA" | "NEUTRO";
  accuracyScore: number;
  lines: BacktestingLineResult[];
};

function inferCause(predicted: number, actual: number, category: string): string {
  const diff = actual - predicted;
  if (Math.abs(diff) < Math.abs(predicted) * 0.05) return "Dentro da margem esperada de variação.";
  if (diff > 0) return `Entrada/realização maior que a prevista em ${category}: possível subestimação de premissa.`;
  return `Entrada/realização menor que a prevista em ${category}: possível atraso, inadimplência ou superestimação.`;
}

function inferAdjustment(predicted: number, actual: number): string {
  if (predicted === 0) return "Rever premissa: valor previsto zerado divergiu do realizado.";
  const ratio = actual / predicted;
  if (ratio > 1.15) return "Aumentar a premissa de entrada/probabilidade para esta categoria no próximo forecast.";
  if (ratio < 0.85) return "Reduzir a premissa ou aplicar desconto de probabilidade adicional nesta categoria.";
  return "Manter premissa atual — desvio dentro do aceitável.";
}

export function runBacktesting(pairs: BacktestingPair[]): BacktestingSummary {
  const lines: BacktestingLineResult[] = pairs.map((pair) => {
    const absoluteError = Math.abs(pair.actualAmount - pair.predictedAmount);
    const percentageError =
      pair.predictedAmount !== 0 ? absoluteError / Math.abs(pair.predictedAmount) : pair.actualAmount !== 0 ? 1 : 0;
    return {
      ...pair,
      absoluteError,
      percentageError,
      cause: inferCause(pair.predictedAmount, pair.actualAmount, pair.category),
      adjustmentRecommendation: inferAdjustment(pair.predictedAmount, pair.actualAmount),
    };
  });

  const totalAbsoluteError = lines.reduce((sum, l) => sum + l.absoluteError, 0);
  const totalPredicted = pairs.reduce((sum, p) => sum + p.predictedAmount, 0);
  const totalActual = pairs.reduce((sum, p) => sum + p.actualAmount, 0);
  const totalPercentageError =
    totalPredicted !== 0 ? Math.abs(totalActual - totalPredicted) / Math.abs(totalPredicted) : 0;

  const netBias = totalActual - totalPredicted;
  const biasThreshold = Math.abs(totalPredicted) * 0.03;
  const bias: BacktestingSummary["bias"] =
    Math.abs(netBias) <= biasThreshold ? "NEUTRO" : netBias > 0 ? "PESSIMISTA" : "OTIMISTA";
  // PESSIMISTA: realizado superou previsto (forecast foi conservador demais).
  // OTIMISTA: realizado ficou abaixo do previsto (forecast superestimou entradas).

  const accuracyScore = Math.max(0, 1 - totalPercentageError);

  return { totalAbsoluteError, totalPercentageError, bias, accuracyScore, lines };
}
