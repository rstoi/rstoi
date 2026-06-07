import Database from "better-sqlite3";
import type {
  BankAccount,
  BankTransaction,
  Supplier,
  Payable,
  Receivable,
  Anticipation,
  CashFlowProjection,
  AgentLog,
  CollectionAttempt,
  TransactionType,
  PayableStatus,
  ReceivableStatus,
  CollectionStage,
  AnticipationStatus,
  CashFlowConfidence,
} from "./types.js";

export function initTreasurySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS treasury_bank_accounts (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      bank_code      TEXT NOT NULL,
      agency         TEXT NOT NULL,
      account_number TEXT NOT NULL,
      balance        REAL NOT NULL DEFAULT 0,
      min_balance    REAL NOT NULL DEFAULT 0,
      currency       TEXT NOT NULL DEFAULT 'BRL',
      is_active      INTEGER NOT NULL DEFAULT 1,
      updated_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS treasury_bank_transactions (
      id              TEXT PRIMARY KEY,
      account_id      TEXT NOT NULL REFERENCES treasury_bank_accounts(id),
      date            INTEGER NOT NULL,
      amount          REAL NOT NULL,
      description     TEXT,
      type            TEXT NOT NULL,
      category        TEXT,
      reconciled      INTEGER NOT NULL DEFAULT 0,
      reconciled_with TEXT,
      created_at      INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tbt_account ON treasury_bank_transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_tbt_date    ON treasury_bank_transactions(date);

    CREATE TABLE IF NOT EXISTS treasury_suppliers (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      cnpj           TEXT,
      payment_terms  INTEGER NOT NULL DEFAULT 30,
      criticality    TEXT NOT NULL DEFAULT 'medium',
      contact_email  TEXT,
      contact_phone  TEXT,
      is_active      INTEGER NOT NULL DEFAULT 1,
      created_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS treasury_payables (
      id                 TEXT PRIMARY KEY,
      supplier_id        TEXT REFERENCES treasury_suppliers(id),
      description        TEXT NOT NULL,
      amount             REAL NOT NULL,
      due_date           INTEGER NOT NULL,
      status             TEXT NOT NULL DEFAULT 'pending',
      payment_account_id TEXT REFERENCES treasury_bank_accounts(id),
      paid_at            INTEGER,
      paid_amount        REAL,
      invoice_number     TEXT,
      notes              TEXT,
      auto_approve       INTEGER NOT NULL DEFAULT 0,
      created_at         INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tp_status   ON treasury_payables(status);
    CREATE INDEX IF NOT EXISTS idx_tp_due_date ON treasury_payables(due_date);

    CREATE TABLE IF NOT EXISTS treasury_receivables (
      id               TEXT PRIMARY KEY,
      customer_name    TEXT NOT NULL,
      customer_cnpj    TEXT,
      customer_email   TEXT,
      customer_phone   TEXT,
      description      TEXT NOT NULL,
      amount           REAL NOT NULL,
      due_date         INTEGER NOT NULL,
      status           TEXT NOT NULL DEFAULT 'open',
      received_amount  REAL NOT NULL DEFAULT 0,
      last_contact_at  INTEGER,
      collection_stage TEXT NOT NULL DEFAULT 'none',
      invoice_number   TEXT,
      notes            TEXT,
      can_anticipate   INTEGER NOT NULL DEFAULT 1,
      created_at       INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tr_status   ON treasury_receivables(status);
    CREATE INDEX IF NOT EXISTS idx_tr_due_date ON treasury_receivables(due_date);

    CREATE TABLE IF NOT EXISTS treasury_anticipations (
      id                TEXT PRIMARY KEY,
      receivable_id     TEXT NOT NULL REFERENCES treasury_receivables(id),
      face_value        REAL NOT NULL,
      anticipated_amount REAL NOT NULL,
      discount_rate     REAL NOT NULL,
      provider          TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'requested',
      bank_account_id   TEXT REFERENCES treasury_bank_accounts(id),
      requested_at      INTEGER NOT NULL,
      executed_at       INTEGER
    );

    CREATE TABLE IF NOT EXISTS treasury_cash_flow (
      id               TEXT PRIMARY KEY,
      projection_date  INTEGER NOT NULL,
      opening_balance  REAL NOT NULL DEFAULT 0,
      inflows          REAL NOT NULL DEFAULT 0,
      outflows         REAL NOT NULL DEFAULT 0,
      closing_balance  REAL NOT NULL DEFAULT 0,
      confidence       TEXT NOT NULL DEFAULT 'base',
      generated_at     INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tcf_date ON treasury_cash_flow(projection_date);

    CREATE TABLE IF NOT EXISTS treasury_agent_logs (
      id                TEXT PRIMARY KEY,
      agent             TEXT NOT NULL,
      action            TEXT NOT NULL,
      decision          TEXT NOT NULL,
      justification     TEXT,
      amount            REAL,
      entity_id         TEXT,
      entity_type       TEXT,
      requires_approval INTEGER NOT NULL DEFAULT 0,
      approved_by       TEXT,
      approved_at       INTEGER,
      executed          INTEGER NOT NULL DEFAULT 0,
      executed_at       INTEGER,
      created_at        INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tal_agent ON treasury_agent_logs(agent);

    CREATE TABLE IF NOT EXISTS treasury_collection_attempts (
      id             TEXT PRIMARY KEY,
      receivable_id  TEXT NOT NULL REFERENCES treasury_receivables(id),
      channel        TEXT NOT NULL,
      message        TEXT,
      sent_at        INTEGER NOT NULL,
      response       TEXT,
      responded_at   INTEGER
    );
  `);
}

// ── Bank Accounts ─────────────────────────────────────────────────────────────

export function upsertBankAccount(db: Database.Database, acc: BankAccount): void {
  db.prepare(`
    INSERT INTO treasury_bank_accounts (id, name, bank_code, agency, account_number, balance, min_balance, currency, is_active, updated_at)
    VALUES (@id, @name, @bankCode, @agency, @accountNumber, @balance, @minBalance, @currency, @isActive, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      balance = excluded.balance,
      min_balance = excluded.min_balance,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `).run({ ...acc, isActive: acc.isActive ? 1 : 0 });
}

export function getBankAccounts(db: Database.Database): BankAccount[] {
  return (db.prepare(`SELECT * FROM treasury_bank_accounts WHERE is_active = 1`).all() as Record<string, unknown>[]).map(rowToAccount);
}

export function getBankAccount(db: Database.Database, id: string): BankAccount | null {
  const row = db.prepare(`SELECT * FROM treasury_bank_accounts WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToAccount(row) : null;
}

export function updateAccountBalance(db: Database.Database, id: string, balance: number): void {
  db.prepare(`UPDATE treasury_bank_accounts SET balance = ?, updated_at = ? WHERE id = ?`).run(balance, Date.now(), id);
}

function rowToAccount(r: Record<string, unknown>): BankAccount {
  return {
    id: r.id as string,
    name: r.name as string,
    bankCode: r.bank_code as string,
    agency: r.agency as string,
    accountNumber: r.account_number as string,
    balance: r.balance as number,
    minBalance: r.min_balance as number,
    currency: (r.currency as string) as BankAccount["currency"],
    isActive: (r.is_active as number) === 1,
    updatedAt: r.updated_at as number,
  };
}

// ── Bank Transactions ─────────────────────────────────────────────────────────

export function insertTransaction(db: Database.Database, tx: BankTransaction): void {
  db.prepare(`
    INSERT OR IGNORE INTO treasury_bank_transactions
      (id, account_id, date, amount, description, type, category, reconciled, reconciled_with, created_at)
    VALUES (@id, @accountId, @date, @amount, @description, @type, @category, @reconciled, @reconciledWith, @createdAt)
  `).run({
    id: tx.id,
    accountId: tx.accountId,
    date: tx.date,
    amount: tx.amount,
    description: tx.description ?? null,
    type: tx.type,
    category: tx.category ?? null,
    reconciled: tx.reconciled ? 1 : 0,
    reconciledWith: tx.reconciledWith ?? null,
    createdAt: tx.createdAt,
  });
}

export function getUnreconciledTransactions(db: Database.Database, accountId?: string): BankTransaction[] {
  const sql = accountId
    ? `SELECT * FROM treasury_bank_transactions WHERE reconciled = 0 AND account_id = ? ORDER BY date`
    : `SELECT * FROM treasury_bank_transactions WHERE reconciled = 0 ORDER BY date`;
  const rows = (accountId
    ? db.prepare(sql).all(accountId)
    : db.prepare(sql).all()) as Record<string, unknown>[];
  return rows.map(rowToTx);
}

export function markTransactionReconciled(db: Database.Database, id: string, reconciledWith: string): void {
  db.prepare(`UPDATE treasury_bank_transactions SET reconciled = 1, reconciled_with = ? WHERE id = ?`).run(reconciledWith, id);
}

function rowToTx(r: Record<string, unknown>): BankTransaction {
  return {
    id: r.id as string,
    accountId: r.account_id as string,
    date: r.date as number,
    amount: r.amount as number,
    description: r.description as string,
    type: r.type as TransactionType,
    category: r.category as string | undefined,
    reconciled: (r.reconciled as number) === 1,
    reconciledWith: r.reconciled_with as string | undefined,
    createdAt: r.created_at as number,
  };
}

// ── Suppliers ─────────────────────────────────────────────────────────────────

export function upsertSupplier(db: Database.Database, s: Supplier): void {
  db.prepare(`
    INSERT INTO treasury_suppliers (id, name, cnpj, payment_terms, criticality, contact_email, contact_phone, is_active, created_at)
    VALUES (@id, @name, @cnpj, @paymentTerms, @criticality, @contactEmail, @contactPhone, @isActive, @createdAt)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, criticality = excluded.criticality,
      contact_email = excluded.contact_email, contact_phone = excluded.contact_phone,
      is_active = excluded.is_active
  `).run({
    id: s.id,
    name: s.name,
    cnpj: s.cnpj ?? null,
    paymentTerms: s.paymentTerms,
    criticality: s.criticality,
    contactEmail: s.contactEmail ?? null,
    contactPhone: s.contactPhone ?? null,
    isActive: s.isActive ? 1 : 0,
    createdAt: s.createdAt,
  });
}

export function getSupplier(db: Database.Database, id: string): Supplier | null {
  const row = db.prepare(`SELECT * FROM treasury_suppliers WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToSupplier(row) : null;
}

function rowToSupplier(r: Record<string, unknown>): Supplier {
  return {
    id: r.id as string,
    name: r.name as string,
    cnpj: r.cnpj as string | undefined,
    paymentTerms: r.payment_terms as number,
    criticality: r.criticality as Supplier["criticality"],
    contactEmail: r.contact_email as string | undefined,
    contactPhone: r.contact_phone as string | undefined,
    isActive: (r.is_active as number) === 1,
    createdAt: r.created_at as number,
  };
}

// ── Payables ──────────────────────────────────────────────────────────────────

export function upsertPayable(db: Database.Database, p: Payable): void {
  db.prepare(`
    INSERT INTO treasury_payables
      (id, supplier_id, description, amount, due_date, status, payment_account_id, paid_at, paid_amount, invoice_number, notes, auto_approve, created_at)
    VALUES (@id, @supplierId, @description, @amount, @dueDate, @status, @paymentAccountId, @paidAt, @paidAmount, @invoiceNumber, @notes, @autoApprove, @createdAt)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status, paid_at = excluded.paid_at,
      paid_amount = excluded.paid_amount, notes = excluded.notes
  `).run({
    id: p.id,
    supplierId: p.supplierId ?? null,
    description: p.description,
    amount: p.amount,
    dueDate: p.dueDate,
    status: p.status,
    paymentAccountId: p.paymentAccountId ?? null,
    paidAt: p.paidAt ?? null,
    paidAmount: p.paidAmount ?? null,
    invoiceNumber: p.invoiceNumber ?? null,
    notes: p.notes ?? null,
    autoApprove: p.autoApprove ? 1 : 0,
    createdAt: p.createdAt,
  });
}

export function getPendingPayables(db: Database.Database): Payable[] {
  return (db.prepare(`
    SELECT p.*, s.name as supplier_name, s.criticality as supplier_criticality
    FROM treasury_payables p
    LEFT JOIN treasury_suppliers s ON s.id = p.supplier_id
    WHERE p.status IN ('pending', 'approved')
    ORDER BY p.due_date ASC
  `).all() as Record<string, unknown>[]).map(rowToPayable);
}

export function updatePayableStatus(db: Database.Database, id: string, status: PayableStatus, paidAmount?: number): void {
  db.prepare(`
    UPDATE treasury_payables SET status = ?, paid_at = ?, paid_amount = ? WHERE id = ?
  `).run(status, status === "paid" ? Date.now() : null, paidAmount ?? null, id);
}

export function getPayable(db: Database.Database, id: string): Payable | null {
  const row = db.prepare(`SELECT * FROM treasury_payables WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToPayable(row) : null;
}

function rowToPayable(r: Record<string, unknown>): Payable {
  return {
    id: r.id as string,
    supplierId: r.supplier_id as string | undefined,
    supplierName: r.supplier_name as string | undefined,
    description: r.description as string,
    amount: r.amount as number,
    dueDate: r.due_date as number,
    status: r.status as PayableStatus,
    paymentAccountId: r.payment_account_id as string | undefined,
    paidAt: r.paid_at as number | undefined,
    paidAmount: r.paid_amount as number | undefined,
    invoiceNumber: r.invoice_number as string | undefined,
    notes: r.notes as string | undefined,
    autoApprove: (r.auto_approve as number) === 1,
    createdAt: r.created_at as number,
  };
}

// ── Receivables ───────────────────────────────────────────────────────────────

export function upsertReceivable(db: Database.Database, r: Receivable): void {
  db.prepare(`
    INSERT INTO treasury_receivables
      (id, customer_name, customer_cnpj, customer_email, customer_phone, description, amount, due_date, status, received_amount, last_contact_at, collection_stage, invoice_number, notes, can_anticipate, created_at)
    VALUES (@id, @customerName, @customerCnpj, @customerEmail, @customerPhone, @description, @amount, @dueDate, @status, @receivedAmount, @lastContactAt, @collectionStage, @invoiceNumber, @notes, @canAnticipate, @createdAt)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status, received_amount = excluded.received_amount,
      last_contact_at = excluded.last_contact_at, collection_stage = excluded.collection_stage,
      notes = excluded.notes
  `).run({
    id: r.id,
    customerName: r.customerName,
    customerCnpj: r.customerCnpj ?? null,
    customerEmail: r.customerEmail ?? null,
    customerPhone: r.customerPhone ?? null,
    description: r.description,
    amount: r.amount,
    dueDate: r.dueDate,
    status: r.status,
    receivedAmount: r.receivedAmount,
    lastContactAt: r.lastContactAt ?? null,
    collectionStage: r.collectionStage,
    invoiceNumber: r.invoiceNumber ?? null,
    notes: r.notes ?? null,
    canAnticipate: r.canAnticipate ? 1 : 0,
    createdAt: r.createdAt,
  });
}

export function getOpenReceivables(db: Database.Database): Receivable[] {
  return (db.prepare(`
    SELECT * FROM treasury_receivables WHERE status IN ('open', 'overdue', 'partial') ORDER BY due_date ASC
  `).all() as Record<string, unknown>[]).map(rowToReceivable);
}

export function getReceivable(db: Database.Database, id: string): Receivable | null {
  const row = db.prepare(`SELECT * FROM treasury_receivables WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToReceivable(row) : null;
}

export function updateReceivableStatus(db: Database.Database, id: string, status: ReceivableStatus, receivedAmount?: number, collectionStage?: CollectionStage): void {
  db.prepare(`
    UPDATE treasury_receivables SET status = ?, received_amount = COALESCE(?, received_amount),
    collection_stage = COALESCE(?, collection_stage), last_contact_at = ? WHERE id = ?
  `).run(status, receivedAmount ?? null, collectionStage ?? null, Date.now(), id);
}

function rowToReceivable(r: Record<string, unknown>): Receivable {
  return {
    id: r.id as string,
    customerName: r.customer_name as string,
    customerCnpj: r.customer_cnpj as string | undefined,
    customerEmail: r.customer_email as string | undefined,
    customerPhone: r.customer_phone as string | undefined,
    description: r.description as string,
    amount: r.amount as number,
    dueDate: r.due_date as number,
    status: r.status as ReceivableStatus,
    receivedAmount: r.received_amount as number,
    lastContactAt: r.last_contact_at as number | undefined,
    collectionStage: r.collection_stage as CollectionStage,
    invoiceNumber: r.invoice_number as string | undefined,
    notes: r.notes as string | undefined,
    canAnticipate: (r.can_anticipate as number) === 1,
    createdAt: r.created_at as number,
  };
}

// ── Anticipations ─────────────────────────────────────────────────────────────

export function insertAnticipation(db: Database.Database, a: Anticipation): void {
  db.prepare(`
    INSERT INTO treasury_anticipations
      (id, receivable_id, face_value, anticipated_amount, discount_rate, provider, status, bank_account_id, requested_at, executed_at)
    VALUES (@id, @receivableId, @faceValue, @anticipatedAmount, @discountRate, @provider, @status, @bankAccountId, @requestedAt, @executedAt)
  `).run({
    id: a.id,
    receivableId: a.receivableId,
    faceValue: a.faceValue,
    anticipatedAmount: a.anticipatedAmount,
    discountRate: a.discountRate,
    provider: a.provider,
    status: a.status,
    bankAccountId: a.bankAccountId ?? null,
    requestedAt: a.requestedAt,
    executedAt: a.executedAt ?? null,
  });
}

export function updateAnticipationStatus(db: Database.Database, id: string, status: AnticipationStatus): void {
  db.prepare(`
    UPDATE treasury_anticipations SET status = ?, executed_at = ? WHERE id = ?
  `).run(status, status === "executed" ? Date.now() : null, id);
}

// ── Cash Flow ─────────────────────────────────────────────────────────────────

export function upsertCashFlow(db: Database.Database, cf: CashFlowProjection): void {
  db.prepare(`
    INSERT INTO treasury_cash_flow
      (id, projection_date, opening_balance, inflows, outflows, closing_balance, confidence, generated_at)
    VALUES (@id, @projectionDate, @openingBalance, @inflows, @outflows, @closingBalance, @confidence, @generatedAt)
    ON CONFLICT(id) DO UPDATE SET
      opening_balance = excluded.opening_balance, inflows = excluded.inflows,
      outflows = excluded.outflows, closing_balance = excluded.closing_balance,
      generated_at = excluded.generated_at
  `).run(cf);
}

export function getCashFlowProjections(db: Database.Database, days: number = 30): CashFlowProjection[] {
  const from = Date.now();
  const to = from + days * 86_400_000;
  return (db.prepare(`
    SELECT * FROM treasury_cash_flow WHERE projection_date BETWEEN ? AND ? AND confidence = 'base' ORDER BY projection_date
  `).all(from, to) as Record<string, unknown>[]).map(r => ({
    id: r.id as string,
    projectionDate: r.projection_date as number,
    openingBalance: r.opening_balance as number,
    inflows: r.inflows as number,
    outflows: r.outflows as number,
    closingBalance: r.closing_balance as number,
    confidence: r.confidence as CashFlowConfidence,
    generatedAt: r.generated_at as number,
  }));
}

// ── Agent Logs ────────────────────────────────────────────────────────────────

export function insertAgentLog(db: Database.Database, log: AgentLog): void {
  db.prepare(`
    INSERT INTO treasury_agent_logs
      (id, agent, action, decision, justification, amount, entity_id, entity_type, requires_approval, approved_by, approved_at, executed, executed_at, created_at)
    VALUES (@id, @agent, @action, @decision, @justification, @amount, @entityId, @entityType, @requiresApproval, @approvedBy, @approvedAt, @executed, @executedAt, @createdAt)
  `).run({
    id: log.id,
    agent: log.agent,
    action: log.action,
    decision: log.decision,
    justification: log.justification ?? null,
    amount: log.amount ?? null,
    entityId: log.entityId ?? null,
    entityType: log.entityType ?? null,
    requiresApproval: log.requiresApproval ? 1 : 0,
    approvedBy: log.approvedBy ?? null,
    approvedAt: log.approvedAt ?? null,
    executed: log.executed ? 1 : 0,
    executedAt: log.executedAt ?? null,
    createdAt: log.createdAt,
  });
}

export function getPendingApprovals(db: Database.Database): AgentLog[] {
  return (db.prepare(`
    SELECT * FROM treasury_agent_logs WHERE requires_approval = 1 AND approved_at IS NULL AND executed = 0 ORDER BY created_at DESC
  `).all() as Record<string, unknown>[]).map(rowToLog);
}

export function approveAgentLog(db: Database.Database, id: string, approvedBy: string): void {
  db.prepare(`UPDATE treasury_agent_logs SET approved_by = ?, approved_at = ? WHERE id = ?`).run(approvedBy, Date.now(), id);
}

function rowToLog(r: Record<string, unknown>): AgentLog {
  return {
    id: r.id as string,
    agent: r.agent as string,
    action: r.action as string,
    decision: r.decision as string,
    justification: r.justification as string | undefined,
    amount: r.amount as number | undefined,
    entityId: r.entity_id as string | undefined,
    entityType: r.entity_type as string | undefined,
    requiresApproval: (r.requires_approval as number) === 1,
    approvedBy: r.approved_by as string | undefined,
    approvedAt: r.approved_at as number | undefined,
    executed: (r.executed as number) === 1,
    executedAt: r.executed_at as number | undefined,
    createdAt: r.created_at as number,
  };
}

// ── Collection Attempts ───────────────────────────────────────────────────────

export function insertCollectionAttempt(db: Database.Database, a: CollectionAttempt): void {
  db.prepare(`
    INSERT INTO treasury_collection_attempts (id, receivable_id, channel, message, sent_at, response, responded_at)
    VALUES (@id, @receivableId, @channel, @message, @sentAt, @response, @respondedAt)
  `).run({
    id: a.id,
    receivableId: a.receivableId,
    channel: a.channel,
    message: a.message ?? null,
    sentAt: a.sentAt,
    response: a.response ?? null,
    respondedAt: a.respondedAt ?? null,
  });
}

export function getCollectionAttempts(db: Database.Database, receivableId: string): CollectionAttempt[] {
  return (db.prepare(`SELECT * FROM treasury_collection_attempts WHERE receivable_id = ? ORDER BY sent_at DESC`).all(receivableId) as Record<string, unknown>[]).map(r => ({
    id: r.id as string,
    receivableId: r.receivable_id as string,
    channel: r.channel as CollectionAttempt["channel"],
    message: r.message as string | undefined,
    sentAt: r.sent_at as number,
    response: r.response as string | undefined,
    respondedAt: r.responded_at as number | undefined,
  }));
}
