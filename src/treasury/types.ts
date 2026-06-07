export type Currency = "BRL" | "USD" | "EUR";
export type AccountStatus = "active" | "inactive";
export type TransactionType = "credit" | "debit";
export type PayableStatus = "pending" | "approved" | "paid" | "cancelled";
export type ReceivableStatus = "open" | "overdue" | "partial" | "paid" | "written_off";
export type AnticipationStatus = "requested" | "approved" | "executed" | "cancelled";
export type SupplierCriticality = "low" | "medium" | "high" | "critical";
export type CollectionStage = "none" | "reminder" | "dunning" | "negotiation" | "legal";
export type CashFlowConfidence = "pessimistic" | "base" | "optimistic";

export interface BankAccount {
  id: string;
  name: string;
  bankCode: string;
  agency: string;
  accountNumber: string;
  balance: number;
  minBalance: number;
  currency: Currency;
  isActive: boolean;
  updatedAt: number;
}

export interface BankTransaction {
  id: string;
  accountId: string;
  date: number;
  amount: number;
  description: string;
  type: TransactionType;
  category?: string;
  reconciled: boolean;
  reconciledWith?: string;
  createdAt: number;
}

export interface Supplier {
  id: string;
  name: string;
  cnpj?: string;
  paymentTerms: number;
  criticality: SupplierCriticality;
  contactEmail?: string;
  contactPhone?: string;
  isActive: boolean;
  createdAt: number;
}

export interface Payable {
  id: string;
  supplierId?: string;
  supplierName?: string;
  description: string;
  amount: number;
  dueDate: number;
  status: PayableStatus;
  paymentAccountId?: string;
  paidAt?: number;
  paidAmount?: number;
  invoiceNumber?: string;
  notes?: string;
  autoApprove: boolean;
  createdAt: number;
}

export interface Receivable {
  id: string;
  customerName: string;
  customerCnpj?: string;
  customerEmail?: string;
  customerPhone?: string;
  description: string;
  amount: number;
  dueDate: number;
  status: ReceivableStatus;
  receivedAmount: number;
  lastContactAt?: number;
  collectionStage: CollectionStage;
  invoiceNumber?: string;
  notes?: string;
  canAnticipate: boolean;
  createdAt: number;
}

export interface Anticipation {
  id: string;
  receivableId: string;
  faceValue: number;
  anticipatedAmount: number;
  discountRate: number;
  provider: string;
  status: AnticipationStatus;
  bankAccountId?: string;
  requestedAt: number;
  executedAt?: number;
}

export interface CashFlowProjection {
  id: string;
  projectionDate: number;
  openingBalance: number;
  inflows: number;
  outflows: number;
  closingBalance: number;
  confidence: CashFlowConfidence;
  generatedAt: number;
}

export interface AgentLog {
  id: string;
  agent: string;
  action: string;
  decision: string;
  justification?: string;
  amount?: number;
  entityId?: string;
  entityType?: string;
  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: number;
  executed: boolean;
  executedAt?: number;
  createdAt: number;
}

export interface CollectionAttempt {
  id: string;
  receivableId: string;
  channel: "email" | "whatsapp" | "phone";
  message?: string;
  sentAt: number;
  response?: string;
  respondedAt?: number;
}

export interface CashPosition {
  totalBalance: number;
  accounts: { name: string; balance: number; currency: Currency }[];
  pendingPayables: number;
  pendingReceivables: number;
  overdueReceivables: number;
  netPosition: number;
  projectedBalance7d: number;
  projectedBalance30d: number;
  asOf: number;
}

export interface PaymentQueueItem extends Payable {
  supplierCriticality?: SupplierCriticality;
  daysUntilDue: number;
  discountIfEarly?: number;
  recommendedAction: "pay_now" | "pay_on_due" | "defer" | "negotiate";
}

export interface AgentRunResult {
  agent: string;
  decisions: AgentDecision[];
  executedCount: number;
  pendingApprovalCount: number;
  runAt: number;
}

export interface AgentDecision {
  action: string;
  justification: string;
  amount?: number;
  entityId?: string;
  entityType?: string;
  requiresApproval: boolean;
  executed?: boolean;
}
