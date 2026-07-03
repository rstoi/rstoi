/**
 * ReconciliationService — cruza eventos de fontes diferentes (banco x notas,
 * ERP x banco, contratos x obrigações, e-mail x boletos) para identificar
 * correspondências e divergências.
 */

export type ReconciliationCandidate = {
  id: string;
  amount: number;
  date: string; // yyyy-MM-dd
  counterparty?: string | null;
};

export type ReconciliationMatch = {
  primaryId: string;
  relatedId: string;
  status: "MATCHED" | "DIVERGENT";
  divergenceAmount: number;
  daysApart: number;
};

function daysBetween(a: string, b: string): number {
  const diff = new Date(a).getTime() - new Date(b).getTime();
  return Math.abs(diff) / (1000 * 60 * 60 * 24);
}

function normalize(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

const AMOUNT_TOLERANCE = 0.01;
const DATE_TOLERANCE_DAYS = 5;

/**
 * Tenta parear cada item de `primary` com o melhor candidato em `related`
 * (mesma contraparte, valor e data dentro da tolerância). Itens sem par são
 * ignorados aqui — cabem a uma revisão manual ou a um agente de qualidade.
 */
export function matchReconciliation(
  primary: ReconciliationCandidate[],
  related: ReconciliationCandidate[]
): ReconciliationMatch[] {
  const matches: ReconciliationMatch[] = [];
  const usedRelated = new Set<string>();

  for (const p of primary) {
    let best: ReconciliationCandidate | null = null;
    let bestScore = Infinity;

    for (const r of related) {
      if (usedRelated.has(r.id)) continue;
      if (normalize(p.counterparty) !== normalize(r.counterparty)) continue;
      const days = daysBetween(p.date, r.date);
      if (days > DATE_TOLERANCE_DAYS) continue;
      const amountDiff = Math.abs(p.amount - r.amount);
      const score = amountDiff * 10 + days;
      if (score < bestScore) {
        bestScore = score;
        best = r;
      }
    }

    if (!best) continue;

    const divergenceAmount = Math.abs(p.amount - best.amount);
    const status = divergenceAmount <= AMOUNT_TOLERANCE ? "MATCHED" : "DIVERGENT";
    matches.push({
      primaryId: p.id,
      relatedId: best.id,
      status,
      divergenceAmount,
      daysApart: daysBetween(p.date, best.date),
    });
    usedRelated.add(best.id);
  }

  return matches;
}
