/**
 * NormalizerAgent — padroniza datas, valores, contrapartes e descrições de
 * linhas brutas extraídas em candidatos de FinancialEvent prontos para
 * classificação.
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import type { DataSourceType } from "@prisma/client";

export type NormalizerInput = {
  sourceType: DataSourceType;
  rows: Record<string, unknown>[];
};

export type NormalizedEventCandidate = {
  financialDate: string | null; // yyyy-MM-dd
  grossAmount: number;
  netAmount: number;
  counterpartyName: string | null;
  originalDescription: string;
  normalizedDescription: string;
  raw: Record<string, unknown>;
};

export type NormalizerOutput = {
  candidates: NormalizedEventCandidate[];
};

const DATE_FIELD_CANDIDATES = ["date", "data", "dtposted", "dt", "competencia", "vencimento", "financialDate"];
const AMOUNT_FIELD_CANDIDATES = ["amount", "valor", "value", "trnamt", "netAmount", "grossAmount"];
const COUNTERPARTY_FIELD_CANDIDATES = ["counterparty", "contraparte", "memo", "name", "descricao", "description", "fornecedor", "cliente"];

function pickField(row: Record<string, unknown>, candidates: string[]): unknown {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const key = keys.find((k) => k.toLowerCase().replace(/[^a-z]/g, "") === candidate.replace(/[^a-z]/g, ""));
    if (key && row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return null;
}

function parseDate(value: unknown): string | null {
  if (!value) return null;
  const str = String(value).trim();

  // yyyyMMdd (comum em OFX)
  if (/^\d{8}$/.test(str)) {
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
  }
  // dd/MM/yyyy
  const brMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  // yyyy-MM-dd (ISO), possivelmente com hora
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function parseAmount(value: unknown): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  let str = String(value).trim();
  // Formato brasileiro "1.234,56" -> "1234.56"
  if (/,\d{1,2}$/.test(str)) {
    str = str.replace(/\./g, "").replace(",", ".");
  }
  const parsed = parseFloat(str.replace(/[^0-9.-]/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeDescription(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export class NormalizerAgent extends BaseAgent<NormalizerInput, NormalizerOutput> {
  readonly name = "NormalizerAgent";
  readonly version = "1.0.0";
  readonly description = "Padroniza datas, valores, contrapartes e descrições.";

  protected async execute(input: NormalizerInput): Promise<AgentRunResult<NormalizerOutput>> {
    const warnings: AgentRunResult<NormalizerOutput>["warnings"] = [];
    let unparsedDates = 0;

    const candidates: NormalizedEventCandidate[] = input.rows.map((row) => {
      const rawDate = pickField(row, DATE_FIELD_CANDIDATES);
      const financialDate = parseDate(rawDate);
      if (!financialDate) unparsedDates++;

      const rawAmount = pickField(row, AMOUNT_FIELD_CANDIDATES);
      const amount = parseAmount(rawAmount);

      const rawCounterparty = pickField(row, COUNTERPARTY_FIELD_CANDIDATES);
      const originalDescription = String(rawCounterparty ?? JSON.stringify(row).slice(0, 200));

      return {
        financialDate,
        grossAmount: amount,
        netAmount: amount,
        counterpartyName: rawCounterparty ? String(rawCounterparty) : null,
        originalDescription,
        normalizedDescription: normalizeDescription(originalDescription),
        raw: row,
      };
    });

    if (unparsedDates > 0) {
      warnings.push({
        code: "UNPARSED_DATES",
        message: `${unparsedDates} linha(s) sem data reconhecida — necessitam revisão manual.`,
      });
    }

    const confidence = candidates.length > 0 ? Math.max(0.3, 1 - unparsedDates / candidates.length) : 0;

    return {
      output: { candidates },
      confidence,
      warnings,
      errors: [],
      ruleBasedMode: true,
    };
  }
}
