/**
 * ForecastService — projeção de fluxo de caixa diário (30 dias) e mensal
 * (até o fim do ano), nos três cenários: conservador, base e otimista.
 *
 * Saldo final = saldo inicial + entradas confirmadas + entradas prováveis +
 * entradas possíveis - saídas obrigatórias - saídas renegociáveis - saídas
 * adiáveis.
 */
import type { ForecastScenario, ReliabilityRating } from "@prisma/client";
import { ratingForecastInclusion } from "@/lib/rating-service";

export type CashFlowItem = {
  date: string; // yyyy-MM-dd
  amount: number;
  rating: ReliabilityRating;
  /** obrigatória (não pode ser adiada), renegociável ou adiável — apenas para saídas */
  outflowKind?: "MANDATORY" | "RENEGOTIABLE" | "DEFERRABLE";
};

export type ForecastLineResult = {
  date: string;
  openingBalance: number;
  confirmedInflows: number;
  probableInflows: number;
  possibleInflows: number;
  mandatoryOutflows: number;
  renegotiableOutflows: number;
  deferrableOutflows: number;
  closingBalance: number;
  confidence: number;
};

export function buildDailyForecast(params: {
  startingBalance: number;
  dates: string[];
  inflows: CashFlowItem[];
  outflows: CashFlowItem[];
  scenario: ForecastScenario;
}): ForecastLineResult[] {
  const { startingBalance, dates, inflows, outflows, scenario } = params;
  const results: ForecastLineResult[] = [];
  let runningBalance = startingBalance;

  for (const date of dates) {
    const dayInflows = inflows.filter((i) => i.date === date);
    const dayOutflows = outflows.filter((o) => o.date === date);

    let confirmedInflows = 0;
    let probableInflows = 0;
    let possibleInflows = 0;
    const confidences: number[] = [];

    for (const item of dayInflows) {
      const { included, probabilityWeight } = ratingForecastInclusion(item.rating, scenario);
      if (!included) continue;
      const weighted = item.amount * probabilityWeight;
      confidences.push(probabilityWeight);
      if (item.rating === "A" || item.rating === "B") confirmedInflows += weighted;
      else if (item.rating === "C") probableInflows += weighted;
      else possibleInflows += weighted;
    }

    let mandatoryOutflows = 0;
    let renegotiableOutflows = 0;
    let deferrableOutflows = 0;

    for (const item of dayOutflows) {
      const { included, probabilityWeight } = ratingForecastInclusion(item.rating, scenario);
      if (!included && item.outflowKind === "MANDATORY") {
        // saídas obrigatórias entram em todos os cenários independentemente do rating de origem,
        // pois representam compromissos já assumidos (ex.: folha, impostos vencidos).
        mandatoryOutflows += item.amount;
        continue;
      }
      if (!included) continue;
      const weighted = item.amount * probabilityWeight;
      if (item.outflowKind === "RENEGOTIABLE") renegotiableOutflows += weighted;
      else if (item.outflowKind === "DEFERRABLE") deferrableOutflows += weighted;
      else mandatoryOutflows += weighted;
    }

    const openingBalance = runningBalance;
    const closingBalance =
      openingBalance +
      confirmedInflows +
      probableInflows +
      possibleInflows -
      mandatoryOutflows -
      renegotiableOutflows -
      deferrableOutflows;

    const avgConfidence =
      confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 1;

    results.push({
      date,
      openingBalance,
      confirmedInflows,
      probableInflows,
      possibleInflows,
      mandatoryOutflows,
      renegotiableOutflows,
      deferrableOutflows,
      closingBalance,
      confidence: avgConfidence,
    });

    runningBalance = closingBalance;
  }

  return results;
}

export function findLowestBalance(lines: ForecastLineResult[]): { date: string; balance: number } | null {
  if (lines.length === 0) return null;
  let lowest = lines[0];
  for (const line of lines) {
    if (line.closingBalance < lowest.closingBalance) lowest = line;
  }
  return { date: lowest.date, balance: lowest.closingBalance };
}

export function aggregateMonthly(
  lines: ForecastLineResult[]
): Array<{ month: string; closingBalance: number; netFlow: number }> {
  const byMonth = new Map<string, ForecastLineResult[]>();
  for (const line of lines) {
    const month = line.date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(line);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthLines]) => {
      const last = monthLines[monthLines.length - 1];
      const first = monthLines[0];
      return {
        month,
        closingBalance: last.closingBalance,
        netFlow: last.closingBalance - first.openingBalance,
      };
    });
}
