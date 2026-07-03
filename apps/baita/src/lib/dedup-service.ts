/**
 * DeduplicatorService — detecta eventos financeiros potencialmente duplicados
 * por valor, data, contraparte e documento.
 */

export type DedupCandidate = {
  id: string;
  amount: number;
  date: string; // yyyy-MM-dd
  counterparty?: string | null;
  documentRef?: string | null;
};

export type DuplicateMatch = {
  id: string;
  duplicateOfId: string;
  reason: string;
  confidence: number;
};

function normalizeCounterparty(value?: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function daysBetween(a: string, b: string): number {
  const diff = new Date(a).getTime() - new Date(b).getTime();
  return Math.abs(diff) / (1000 * 60 * 60 * 24);
}

/**
 * Compara eventos dois a dois. Um par é considerado potencial duplicata se:
 * - mesmo documento de referência (match forte, confiança máxima); ou
 * - mesmo valor, mesma contraparte normalizada e datas a até 2 dias de distância.
 */
export function detectDuplicates(candidates: DedupCandidate[]): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (seen.has(b.id)) continue;

      if (a.documentRef && b.documentRef && a.documentRef === b.documentRef) {
        matches.push({
          id: b.id,
          duplicateOfId: a.id,
          reason: `Mesmo documento de referência (${a.documentRef}).`,
          confidence: 0.99,
        });
        seen.add(b.id);
        continue;
      }

      const sameAmount = Math.abs(a.amount - b.amount) < 0.01;
      const sameCounterparty =
        normalizeCounterparty(a.counterparty) !== "" &&
        normalizeCounterparty(a.counterparty) === normalizeCounterparty(b.counterparty);
      const closeDates = daysBetween(a.date, b.date) <= 2;

      if (sameAmount && sameCounterparty && closeDates) {
        matches.push({
          id: b.id,
          duplicateOfId: a.id,
          reason: `Mesmo valor (${a.amount}), mesma contraparte e datas próximas (${a.date} / ${b.date}).`,
          confidence: 0.85,
        });
        seen.add(b.id);
      }
    }
  }

  return matches;
}
