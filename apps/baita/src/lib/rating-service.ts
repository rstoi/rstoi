/**
 * RatingService — regra central de confiabilidade da plataforma.
 *
 * Toda informação financeira (evento, recomendação, decisão, linha de
 * forecast) recebe um ReliabilityRating de A a E (ou UNKNOWN). Este serviço
 * concentra os critérios de atribuição e as regras de uso por tipo de
 * decisão, para que nenhuma tela ou agente reimplemente a lógica.
 */
import type { ReliabilityRating, ForecastScenario } from "@prisma/client";

export type RatingEvidenceInput = {
  /** Número de fontes fortes independentes que confirmam o dado. */
  strongSourceCount?: number;
  /** Extrato bancário conciliado com documento correspondente. */
  bankStatementMatchesDocument?: boolean;
  /** Guia oficial paga com comprovação bancária. */
  officialGuidePaidWithBankProof?: boolean;
  /** Nota fiscal emitida com recebimento conciliado. */
  invoiceReconciledWithReceipt?: boolean;
  /** Nota fiscal emitida, mas sem recebimento confirmado. */
  invoiceIssuedWithoutReceipt?: boolean;
  /** Extrato bancário identificado claramente (sem documento cruzado). */
  bankStatementClearlyIdentified?: boolean;
  /** Contrato formal assinado, mas sem liquidação financeira. */
  formalContractWithoutSettlement?: boolean;
  /** Lançamento em ERP sem conciliação bancária/documental. */
  erpWithoutReconciliation?: boolean;
  /** E-mail com boleto anexado, sem comprovação de pagamento. */
  emailWithBoletoNoPayment?: boolean;
  /** Informação operacional coerente, mas sem documento forte. */
  coherentOperationalNoStrongDocument?: boolean;
  /** Canal informal: WhatsApp, áudio, promessa verbal, estimativa. */
  informalChannel?: boolean;
  /** Hipótese comercial ou pipeline sem confirmação. */
  unconfirmedCommercialHypothesis?: boolean;
  /** Dados contraditórios entre fontes. */
  contradictoryAcrossSources?: boolean;
  /** Divergência relevante entre fontes, sem comprovação suficiente. */
  divergentWithoutProof?: boolean;
};

export type RatingResult = {
  rating: ReliabilityRating;
  rationale: string;
};

export function calculateReliabilityRating(input: RatingEvidenceInput): RatingResult {
  const strongSources = input.strongSourceCount ?? 0;

  if (input.contradictoryAcrossSources) {
    return { rating: "E", rationale: "Dados contraditórios entre fontes distintas." };
  }
  if (input.divergentWithoutProof) {
    return {
      rating: "E",
      rationale: "Divergência entre fontes sem comprovação adequada para decisão.",
    };
  }

  if (
    strongSources >= 2 ||
    input.bankStatementMatchesDocument ||
    input.officialGuidePaidWithBankProof ||
    input.invoiceReconciledWithReceipt
  ) {
    return {
      rating: "A",
      rationale:
        "Confirmado por duas ou mais fontes fortes, ou por extrato/guia/nota fiscal conciliados com pagamento.",
    };
  }

  if (
    strongSources === 1 ||
    input.invoiceIssuedWithoutReceipt ||
    input.bankStatementClearlyIdentified ||
    input.formalContractWithoutSettlement
  ) {
    return {
      rating: "B",
      rationale:
        "Confirmado por uma fonte forte: nota fiscal emitida, extrato bancário identificado ou contrato formal sem liquidação.",
    };
  }

  if (
    input.erpWithoutReconciliation ||
    input.emailWithBoletoNoPayment ||
    input.coherentOperationalNoStrongDocument
  ) {
    return {
      rating: "C",
      rationale:
        "Plausível, mas incompleto: ERP sem conciliação, e-mail com boleto sem pagamento ou informação operacional coerente sem documento forte.",
    };
  }

  if (input.informalChannel || input.unconfirmedCommercialHypothesis) {
    return {
      rating: "D",
      rationale:
        "Informação informal (WhatsApp, áudio, promessa verbal, estimativa) ou hipótese comercial sem confirmação.",
    };
  }

  return { rating: "UNKNOWN", rationale: "Dado ainda não avaliado." };
}

export type DecisionType =
  | "CRITICAL_PAYMENT"
  | "CREDIT_CONTRACTING"
  | "RELEVANT_INVESTMENT"
  | "STRUCTURAL_CUT"
  | "RENEGOTIATION"
  | "COMMERCIAL_HYPOTHESIS";

const RATING_ORDER: ReliabilityRating[] = ["A", "B", "C", "D", "E", "UNKNOWN"];

function atLeast(rating: ReliabilityRating, minimum: ReliabilityRating): boolean {
  return RATING_ORDER.indexOf(rating) <= RATING_ORDER.indexOf(minimum);
}

export type DecisionRatingCheck = {
  allowed: boolean;
  requiresHumanReview: boolean;
  reason: string;
};

/**
 * Valida se um rating de confiabilidade é suficiente para o tipo de decisão
 * pretendido. Não bloqueia a ação no banco de dados — cabe à camada de UI/API
 * exibir o alerta e, quando aplicável, exigir revisão humana explícita.
 */
export function checkRatingForDecision(
  rating: ReliabilityRating,
  decisionType: DecisionType
): DecisionRatingCheck {
  switch (decisionType) {
    case "CRITICAL_PAYMENT":
    case "CREDIT_CONTRACTING":
    case "RELEVANT_INVESTMENT":
      return atLeast(rating, "B")
        ? { allowed: true, requiresHumanReview: false, reason: "Rating A/B: evidência suficiente." }
        : {
            allowed: false,
            requiresHumanReview: true,
            reason: "Esta decisão exige rating A ou B. Reforce a evidência antes de prosseguir.",
          };
    case "STRUCTURAL_CUT":
      return atLeast(rating, "B")
        ? { allowed: true, requiresHumanReview: true, reason: "Rating B ou melhor, com revisão humana obrigatória." }
        : {
            allowed: false,
            requiresHumanReview: true,
            reason: "Corte estrutural exige rating B ou melhor, com revisão humana.",
          };
    case "RENEGOTIATION":
      return atLeast(rating, "C")
        ? { allowed: true, requiresHumanReview: false, reason: "Rating B ou C aceitável para renegociação." }
        : {
            allowed: false,
            requiresHumanReview: true,
            reason: "Renegociação exige ao menos rating C.",
          };
    case "COMMERCIAL_HYPOTHESIS":
      return atLeast(rating, "D")
        ? {
            allowed: true,
            requiresHumanReview: false,
            reason: "Hipótese comercial pode usar rating C ou D, mantida fora do cenário conservador.",
          }
        : {
            allowed: false,
            requiresHumanReview: true,
            reason: "Sem evidência mínima (C ou D) para registrar hipótese comercial.",
          };
    default:
      return { allowed: false, requiresHumanReview: true, reason: "Tipo de decisão desconhecido." };
  }
}

/**
 * Regras de inclusão de um valor com determinado rating em cada cenário de
 * forecast. Retorna também um fator de desconto de probabilidade aplicável
 * (ex.: rating C no cenário base entra com peso reduzido).
 */
export function ratingForecastInclusion(
  rating: ReliabilityRating,
  scenario: ForecastScenario
): { included: boolean; probabilityWeight: number } {
  if (scenario === "CONSERVATIVE") {
    // Forecast conservador: não incluir D nem E/UNKNOWN. Apenas A/B (confirmado/alta confiança).
    const included = atLeast(rating, "B");
    return { included, probabilityWeight: included ? 1 : 0 };
  }
  if (scenario === "BASE") {
    // Cenário base: A/B entram integralmente; C entra com desconto de probabilidade.
    if (atLeast(rating, "B")) return { included: true, probabilityWeight: 1 };
    if (rating === "C") return { included: true, probabilityWeight: 0.5 };
    return { included: false, probabilityWeight: 0 };
  }
  // Otimista: inclui A/B/C integralmente e D explicitamente com peso reduzido.
  if (atLeast(rating, "C")) return { included: true, probabilityWeight: 1 };
  if (rating === "D") return { included: true, probabilityWeight: 0.3 };
  return { included: false, probabilityWeight: 0 };
}

export function ratingLabel(rating: ReliabilityRating): string {
  const labels: Record<ReliabilityRating, string> = {
    A: "A — Confirmado por múltiplas fontes fortes",
    B: "B — Confirmado por uma fonte forte",
    C: "C — Plausível, mas incompleto",
    D: "D — Informal / não confirmado",
    E: "E — Contraditório / divergente",
    UNKNOWN: "Não avaliado",
  };
  return labels[rating];
}

export function ratingColor(rating: ReliabilityRating): "green" | "yellow" | "red" | "gray" {
  if (rating === "A" || rating === "B") return "green";
  if (rating === "C") return "yellow";
  if (rating === "D" || rating === "E") return "red";
  return "gray";
}
