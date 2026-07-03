/** Rótulos em português para os enums do domínio, usados nas telas. */

export const DATA_SOURCE_TYPE_LABELS: Record<string, string> = {
  BANK_STATEMENT: "Extrato bancário",
  ISSUED_INVOICE: "Nota fiscal emitida",
  RECEIVED_INVOICE: "Nota fiscal recebida",
  ACCOUNTING_BOOK: "Balancete / livro contábil",
  GOVERNMENT_DECLARATION: "Declaração governamental",
  ERP: "ERP",
  CLOUD_FILE: "Arquivo em nuvem",
  EMAIL: "E-mail",
  MESSAGING: "Mensageria (WhatsApp etc.)",
  CONTRACT: "Contrato",
  SPREADSHEET: "Planilha",
  CREDIT_BUREAU: "Bureau de crédito",
  TAX: "Fiscal/tributário",
  LEGAL: "Jurídico",
  BENCHMARK: "Benchmark",
  OTHER: "Outro",
};

export const CAREER_STAGE_LABELS: Record<string, string> = {
  BEGINNER: "Iniciante",
  GROWING: "Em crescimento",
  SENIOR: "Sênior",
  PHASEOUT: "Em transição de saída",
};

export const ADIZES_STAGE_LABELS: Record<string, string> = {
  COURTSHIP: "Namoro",
  INFANCY: "Infância",
  GO_GO: "Toca-toca",
  ADOLESCENCE: "Adolescência",
  PRIME: "Plenitude",
  STABILITY: "Estabilidade",
  ARISTOCRACY: "Aristocracia",
  EARLY_BUREAUCRACY: "Burocracia inicial",
  BUREAUCRACY: "Burocracia",
  DEATH: "Morte organizacional",
  UNKNOWN: "Não avaliado",
};

export const PROCESSING_STATUS_LABELS: Record<string, string> = {
  UPLOADED: "Enviado",
  PROCESSING: "Processando",
  PROCESSED: "Processado",
  PROCESSED_WITH_WARNINGS: "Processado com ressalvas",
  FAILED: "Falhou",
  NEEDS_REVIEW: "Necessita revisão",
};

export const RECOMMENDATION_AREA_LABELS: Record<string, string> = {
  TREASURY: "Tesouraria",
  CREDIT: "Crédito",
  INVESTMENT: "Investimento",
  COST_REDUCTION: "Redução de custo",
  COLLECTION: "Cobrança",
  PRICING: "Precificação",
  GOVERNANCE: "Governança",
  PEOPLE: "Pessoas",
  OPERATIONS: "Operações",
  SALES: "Vendas",
  STRATEGY: "Estratégia",
};

export const RECOMMENDATION_STATUS_LABELS: Record<string, string> = {
  OPEN: "Aberta",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluída",
  DISCARDED: "Descartada",
};

export const DECISION_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planejada",
  EXECUTED: "Executada",
  CANCELLED: "Cancelada",
  OVERDUE: "Atrasada",
};

export const CRITICALITY_LABELS: Record<string, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

export const FORECAST_SCENARIO_LABELS: Record<string, string> = {
  CONSERVATIVE: "Conservador",
  BASE: "Base",
  OPTIMISTIC: "Otimista",
};

export const USER_ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  CONSULTANT: "Consultor",
  ANALYST: "Analista",
  COMPANY_OWNER: "Sócio/Proprietário",
  COMPANY_FINANCE: "Financeiro da empresa",
  COMPANY_DIRECTOR: "Diretor",
  ACCOUNTANT: "Contador",
  AUDITOR: "Auditor",
};

export const PDCA_STATUS_LABELS: Record<string, string> = {
  PLAN: "Planejar",
  DO: "Fazer",
  CHECK: "Checar",
  ACT: "Agir",
  CLOSED: "Encerrado",
};

export const RECEIVABLE_STATUS_LABELS: Record<string, string> = {
  OPEN: "Em aberto",
  PARTIALLY_PAID: "Parcialmente pago",
  PAID: "Pago",
  OVERDUE: "Vencido",
  WRITTEN_OFF: "Baixado",
};

export const PAYABLE_STATUS_LABELS: Record<string, string> = {
  OPEN: "Em aberto",
  PARTIALLY_PAID: "Parcialmente pago",
  PAID: "Pago",
  OVERDUE: "Vencido",
  RENEGOTIATED: "Renegociado",
};
