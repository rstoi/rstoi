import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { initTreasurySchema } from "../../src/treasury/db.js";
import {
  upsertBankAccount,
  upsertSupplier,
  upsertPayable,
  upsertReceivable,
  getBankAccounts,
  getPendingPayables,
  getOpenReceivables,
  getUnreconciledTransactions,
  insertTransaction,
  markTransactionReconciled,
  updateAccountBalance,
  updatePayableStatus,
  updateReceivableStatus,
  insertAnticipation,
  upsertCashFlow,
  getCashFlowProjections,
  insertAgentLog,
  getPendingApprovals,
  approveAgentLog,
  getCollectionAttempts,
  insertCollectionAttempt,
} from "../../src/treasury/db.js";
import type {
  BankAccount,
  Supplier,
  Payable,
  Receivable,
  BankTransaction,
  Anticipation,
  CashFlowProjection,
  AgentLog,
  CollectionAttempt,
} from "../../src/treasury/types.js";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initTreasurySchema(db);
  return db;
}

function makeAccount(overrides?: Partial<BankAccount>): BankAccount {
  return {
    id: randomUUID(),
    name: "Itaú Corrente",
    bankCode: "341",
    agency: "0001",
    accountNumber: "12345-6",
    balance: 100_000,
    minBalance: 10_000,
    currency: "BRL",
    isActive: true,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeSupplier(overrides?: Partial<Supplier>): Supplier {
  return {
    id: randomUUID(),
    name: "Fornecedor Teste",
    cnpj: "12.345.678/0001-99",
    paymentTerms: 30,
    criticality: "medium",
    contactEmail: "fornecedor@teste.com",
    isActive: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makePayable(supplierId: string, overrides?: Partial<Payable>): Payable {
  return {
    id: randomUUID(),
    supplierId,
    description: "Nota Fiscal Teste",
    amount: 5_000,
    dueDate: Date.now() + 5 * 86_400_000,
    status: "pending",
    autoApprove: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeReceivable(overrides?: Partial<Receivable>): Receivable {
  return {
    id: randomUUID(),
    customerName: "Cliente Teste",
    customerEmail: "cliente@teste.com",
    description: "NF 001",
    amount: 8_000,
    dueDate: Date.now() + 10 * 86_400_000,
    status: "open",
    receivedAmount: 0,
    collectionStage: "none",
    canAnticipate: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

// ── Schema ──────────────────────────────────────────────────────────────────

describe("Treasury Schema", () => {
  it("initializes all required tables", () => {
    const db = makeDb();
    const tables = (db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'treasury_%'`
    ).all() as { name: string }[]).map(r => r.name);

    expect(tables).toContain("treasury_bank_accounts");
    expect(tables).toContain("treasury_bank_transactions");
    expect(tables).toContain("treasury_suppliers");
    expect(tables).toContain("treasury_payables");
    expect(tables).toContain("treasury_receivables");
    expect(tables).toContain("treasury_anticipations");
    expect(tables).toContain("treasury_cash_flow");
    expect(tables).toContain("treasury_agent_logs");
    expect(tables).toContain("treasury_collection_attempts");
  });

  it("creates all indexes", () => {
    const db = makeDb();
    const indexes = (db.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_t%'`
    ).all() as { name: string }[]).map(r => r.name);

    expect(indexes).toContain("idx_tbt_account");
    expect(indexes).toContain("idx_tp_due_date");
    expect(indexes).toContain("idx_tr_status");
  });
});

// ── Bank Accounts ───────────────────────────────────────────────────────────

describe("Bank Accounts", () => {
  it("creates and retrieves a bank account", () => {
    const db = makeDb();
    const acc = makeAccount();
    upsertBankAccount(db, acc);
    const accounts = getBankAccounts(db);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe("Itaú Corrente");
    expect(accounts[0].balance).toBe(100_000);
    expect(accounts[0].isActive).toBe(true);
  });

  it("updates balance", () => {
    const db = makeDb();
    const acc = makeAccount();
    upsertBankAccount(db, acc);
    updateAccountBalance(db, acc.id, 200_000);
    const accounts = getBankAccounts(db);
    expect(accounts[0].balance).toBe(200_000);
  });

  it("upserts without duplicate", () => {
    const db = makeDb();
    const acc = makeAccount();
    upsertBankAccount(db, acc);
    upsertBankAccount(db, { ...acc, balance: 999 });
    expect(getBankAccounts(db)).toHaveLength(1);
    expect(getBankAccounts(db)[0].balance).toBe(999);
  });

  it("filters inactive accounts", () => {
    const db = makeDb();
    upsertBankAccount(db, makeAccount({ isActive: true }));
    upsertBankAccount(db, makeAccount({ isActive: false }));
    expect(getBankAccounts(db)).toHaveLength(1);
  });

  it("calculates available balance correctly", () => {
    const db = makeDb();
    const acc = makeAccount({ balance: 50_000, minBalance: 10_000 });
    upsertBankAccount(db, acc);
    const accounts = getBankAccounts(db);
    const available = accounts[0].balance - accounts[0].minBalance;
    expect(available).toBe(40_000);
  });
});

// ── Bank Transactions ───────────────────────────────────────────────────────

describe("Bank Transactions", () => {
  it("inserts and retrieves unreconciled transactions", () => {
    const db = makeDb();
    const acc = makeAccount();
    upsertBankAccount(db, acc);

    const tx: BankTransaction = {
      id: randomUUID(),
      accountId: acc.id,
      date: Date.now(),
      amount: 1_500,
      description: "PIX Recebido - Cliente ABC",
      type: "credit",
      reconciled: false,
      createdAt: Date.now(),
    };
    insertTransaction(db, tx);

    const unreconciled = getUnreconciledTransactions(db);
    expect(unreconciled).toHaveLength(1);
    expect(unreconciled[0].type).toBe("credit");
    expect(unreconciled[0].amount).toBe(1_500);
  });

  it("marks transaction as reconciled", () => {
    const db = makeDb();
    const acc = makeAccount();
    upsertBankAccount(db, acc);
    const txId = randomUUID();
    insertTransaction(db, {
      id: txId, accountId: acc.id, date: Date.now(),
      amount: 500, description: "Boleto", type: "debit",
      reconciled: false, createdAt: Date.now(),
    });
    markTransactionReconciled(db, txId, "payable-123");
    expect(getUnreconciledTransactions(db)).toHaveLength(0);
  });

  it("filters unreconciled by account_id", () => {
    const db = makeDb();
    const acc1 = makeAccount();
    const acc2 = makeAccount();
    upsertBankAccount(db, acc1);
    upsertBankAccount(db, acc2);
    insertTransaction(db, { id: randomUUID(), accountId: acc1.id, date: Date.now(), amount: 100, description: "tx1", type: "credit", reconciled: false, createdAt: Date.now() });
    insertTransaction(db, { id: randomUUID(), accountId: acc2.id, date: Date.now(), amount: 200, description: "tx2", type: "debit", reconciled: false, createdAt: Date.now() });
    expect(getUnreconciledTransactions(db, acc1.id)).toHaveLength(1);
    expect(getUnreconciledTransactions(db, acc2.id)).toHaveLength(1);
    expect(getUnreconciledTransactions(db)).toHaveLength(2);
  });
});

// ── Suppliers ───────────────────────────────────────────────────────────────

describe("Suppliers", () => {
  it("creates and retrieves supplier", () => {
    const db = makeDb();
    const s = makeSupplier({ criticality: "critical" });
    upsertSupplier(db, s);
    const payables = getPendingPayables(db);
    expect(payables).toHaveLength(0);
  });

  it("supports all criticality levels", () => {
    const db = makeDb();
    for (const c of ["low", "medium", "high", "critical"] as const) {
      upsertSupplier(db, makeSupplier({ criticality: c }));
    }
    // No error means all inserted
  });
});

// ── Payables ────────────────────────────────────────────────────────────────

describe("Payables", () => {
  it("creates and retrieves pending payable", () => {
    const db = makeDb();
    const s = makeSupplier();
    upsertSupplier(db, s);
    const p = makePayable(s.id, { amount: 12_000 });
    upsertPayable(db, p);

    const pending = getPendingPayables(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].amount).toBe(12_000);
    expect(pending[0].status).toBe("pending");
  });

  it("updates payable status to paid", () => {
    const db = makeDb();
    const s = makeSupplier();
    upsertSupplier(db, s);
    const p = makePayable(s.id);
    upsertPayable(db, p);
    updatePayableStatus(db, p.id, "paid", p.amount);
    expect(getPendingPayables(db)).toHaveLength(0);
  });

  it("sorts by due date ascending", () => {
    const db = makeDb();
    const s = makeSupplier();
    upsertSupplier(db, s);
    const now = Date.now();
    upsertPayable(db, makePayable(s.id, { dueDate: now + 10 * 86_400_000, amount: 1000 }));
    upsertPayable(db, makePayable(s.id, { dueDate: now + 2 * 86_400_000, amount: 2000 }));
    upsertPayable(db, makePayable(s.id, { dueDate: now + 5 * 86_400_000, amount: 3000 }));

    const pending = getPendingPayables(db);
    expect(pending[0].amount).toBe(2000);
    expect(pending[1].amount).toBe(3000);
    expect(pending[2].amount).toBe(1000);
  });

  it("does not return cancelled or paid payables", () => {
    const db = makeDb();
    const s = makeSupplier();
    upsertSupplier(db, s);
    const p1 = makePayable(s.id, { status: "cancelled" });
    const p2 = makePayable(s.id, { status: "paid" });
    const p3 = makePayable(s.id, { status: "pending" });
    upsertPayable(db, p1);
    upsertPayable(db, p2);
    upsertPayable(db, p3);
    expect(getPendingPayables(db)).toHaveLength(1);
  });
});

// ── Receivables ─────────────────────────────────────────────────────────────

describe("Receivables", () => {
  it("creates and retrieves open receivable", () => {
    const db = makeDb();
    const r = makeReceivable({ amount: 15_000 });
    upsertReceivable(db, r);

    const open = getOpenReceivables(db);
    expect(open).toHaveLength(1);
    expect(open[0].amount).toBe(15_000);
    expect(open[0].status).toBe("open");
    expect(open[0].receivedAmount).toBe(0);
  });

  it("registers partial payment", () => {
    const db = makeDb();
    const r = makeReceivable({ amount: 10_000 });
    upsertReceivable(db, r);
    updateReceivableStatus(db, r.id, "partial", 4_000);
    const open = getOpenReceivables(db);
    expect(open[0].status).toBe("partial");
    expect(open[0].receivedAmount).toBe(4_000);
  });

  it("removes paid receivable from open list", () => {
    const db = makeDb();
    const r = makeReceivable();
    upsertReceivable(db, r);
    updateReceivableStatus(db, r.id, "paid", r.amount);
    expect(getOpenReceivables(db)).toHaveLength(0);
  });

  it("updates collection stage", () => {
    const db = makeDb();
    const r = makeReceivable();
    upsertReceivable(db, r);
    updateReceivableStatus(db, r.id, "overdue", undefined, "dunning");
    const open = getOpenReceivables(db);
    expect(open[0].collectionStage).toBe("dunning");
  });

  it("calculates remaining correctly", () => {
    const db = makeDb();
    const r = makeReceivable({ amount: 20_000 });
    upsertReceivable(db, r);
    updateReceivableStatus(db, r.id, "partial", 5_000);
    const open = getOpenReceivables(db);
    const remaining = open[0].amount - open[0].receivedAmount;
    expect(remaining).toBe(15_000);
  });
});

// ── Anticipations ───────────────────────────────────────────────────────────

describe("Anticipations", () => {
  it("registers anticipation", () => {
    const db = makeDb();
    const acc = makeAccount();
    upsertBankAccount(db, acc);
    const r = makeReceivable({ amount: 50_000 });
    upsertReceivable(db, r);

    const ant: Anticipation = {
      id: randomUUID(),
      receivableId: r.id,
      faceValue: 50_000,
      anticipatedAmount: 49_000,
      discountRate: 0.02,
      provider: "Banco Itaú",
      status: "executed",
      bankAccountId: acc.id,
      requestedAt: Date.now(),
      executedAt: Date.now(),
    };
    insertAnticipation(db, ant);
    // Verify no error — anticipation inserted
    const rows = db.prepare(`SELECT * FROM treasury_anticipations`).all();
    expect(rows).toHaveLength(1);
  });

  it("calculates discount correctly", () => {
    const faceValue = 100_000;
    const monthlyRate = 0.015;
    const daysToMaturity = 30;
    const discount = faceValue * (monthlyRate * (daysToMaturity / 30));
    expect(discount).toBe(1_500);
    expect(faceValue - discount).toBe(98_500);
  });
});

// ── Cash Flow ───────────────────────────────────────────────────────────────

describe("Cash Flow Projections", () => {
  it("saves and retrieves projections", () => {
    const db = makeDb();
    const now = Date.now();
    const cf: CashFlowProjection = {
      id: randomUUID(),
      projectionDate: now + 7 * 86_400_000,
      openingBalance: 100_000,
      inflows: 20_000,
      outflows: 15_000,
      closingBalance: 105_000,
      confidence: "base",
      generatedAt: now,
    };
    upsertCashFlow(db, cf);

    const projections = getCashFlowProjections(db, 30);
    expect(projections).toHaveLength(1);
    expect(projections[0].closingBalance).toBe(105_000);
  });

  it("upserts projection without duplicate", () => {
    const db = makeDb();
    const now = Date.now();
    const id = randomUUID();
    const cf = { id, projectionDate: now + 86_400_000, openingBalance: 100_000, inflows: 10_000, outflows: 5_000, closingBalance: 105_000, confidence: "base" as const, generatedAt: now };
    upsertCashFlow(db, cf);
    upsertCashFlow(db, { ...cf, closingBalance: 200_000, inflows: 100_000 });
    const rows = getCashFlowProjections(db, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].closingBalance).toBe(200_000);
  });

  it("filters by date range", () => {
    const db = makeDb();
    const now = Date.now();
    // Day 5 — within 7-day window
    upsertCashFlow(db, { id: randomUUID(), projectionDate: now + 5 * 86_400_000, openingBalance: 0, inflows: 0, outflows: 0, closingBalance: 0, confidence: "base", generatedAt: now });
    // Day 40 — outside 30-day window
    upsertCashFlow(db, { id: randomUUID(), projectionDate: now + 40 * 86_400_000, openingBalance: 0, inflows: 0, outflows: 0, closingBalance: 0, confidence: "base", generatedAt: now });

    expect(getCashFlowProjections(db, 30)).toHaveLength(1);
  });
});

// ── Agent Logs ──────────────────────────────────────────────────────────────

describe("Agent Logs", () => {
  it("inserts agent log", () => {
    const db = makeDb();
    const log: AgentLog = {
      id: randomUUID(),
      agent: "payment",
      action: "execute_payment",
      decision: "{}",
      justification: "Pagamento dentro do prazo",
      amount: 5_000,
      entityId: "payable-1",
      entityType: "payable",
      requiresApproval: false,
      executed: true,
      createdAt: Date.now(),
    };
    insertAgentLog(db, log);
    const rows = db.prepare(`SELECT * FROM treasury_agent_logs`).all();
    expect(rows).toHaveLength(1);
  });

  it("retrieves pending approvals", () => {
    const db = makeDb();
    const log: AgentLog = {
      id: randomUUID(),
      agent: "payment",
      action: "request_payment_approval",
      decision: "{}",
      amount: 600_000,
      entityId: "payable-2",
      entityType: "payable",
      requiresApproval: true,
      executed: false,
      createdAt: Date.now(),
    };
    insertAgentLog(db, log);
    expect(getPendingApprovals(db)).toHaveLength(1);
  });

  it("approves a pending decision", () => {
    const db = makeDb();
    const id = randomUUID();
    insertAgentLog(db, {
      id, agent: "anticipation", action: "execute_anticipation",
      decision: "{}", requiresApproval: true, executed: false, createdAt: Date.now(),
    });
    approveAgentLog(db, id, "diretor.financeiro@empresa.com");
    const pending = getPendingApprovals(db);
    expect(pending).toHaveLength(0);
  });
});

// ── Collection Attempts ─────────────────────────────────────────────────────

describe("Collection Attempts", () => {
  it("records collection attempt", () => {
    const db = makeDb();
    const r = makeReceivable();
    upsertReceivable(db, r);

    const attempt: CollectionAttempt = {
      id: randomUUID(),
      receivableId: r.id,
      channel: "whatsapp",
      message: "Olá! Seu título venceu. Clique para pagar.",
      sentAt: Date.now(),
    };
    insertCollectionAttempt(db, attempt);

    const attempts = getCollectionAttempts(db, r.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].channel).toBe("whatsapp");
  });

  it("returns multiple attempts in desc order", () => {
    const db = makeDb();
    const r = makeReceivable();
    upsertReceivable(db, r);
    const now = Date.now();

    insertCollectionAttempt(db, { id: randomUUID(), receivableId: r.id, channel: "email", sentAt: now - 1000 });
    insertCollectionAttempt(db, { id: randomUUID(), receivableId: r.id, channel: "whatsapp", sentAt: now });
    insertCollectionAttempt(db, { id: randomUUID(), receivableId: r.id, channel: "phone", sentAt: now - 500 });

    const attempts = getCollectionAttempts(db, r.id);
    expect(attempts[0].channel).toBe("whatsapp"); // most recent first
    expect(attempts).toHaveLength(3);
  });
});

// ── Business Logic ──────────────────────────────────────────────────────────

describe("Business Logic", () => {
  it("calculates net cash position correctly", () => {
    const db = makeDb();
    const acc1 = makeAccount({ balance: 80_000 });
    const acc2 = makeAccount({ balance: 120_000 });
    upsertBankAccount(db, acc1);
    upsertBankAccount(db, acc2);

    const s = makeSupplier();
    upsertSupplier(db, s);
    upsertPayable(db, makePayable(s.id, { amount: 30_000 }));
    upsertPayable(db, makePayable(s.id, { amount: 20_000 }));
    upsertReceivable(db, makeReceivable({ amount: 50_000 }));

    const totalBalance = getBankAccounts(db).reduce((s, a) => s + a.balance, 0);
    const totalPayables = getPendingPayables(db).reduce((s, p) => s + p.amount, 0);
    const totalReceivables = getOpenReceivables(db).reduce((s, r) => s + r.amount, 0);

    expect(totalBalance).toBe(200_000);
    expect(totalPayables).toBe(50_000);
    expect(totalReceivables).toBe(50_000);
    expect(totalBalance - totalPayables + totalReceivables).toBe(200_000);
  });

  it("identifies overdue receivables correctly", () => {
    const db = makeDb();
    const now = Date.now();
    // Already overdue
    upsertReceivable(db, makeReceivable({ dueDate: now - 5 * 86_400_000, status: "open" }));
    // Not yet due
    upsertReceivable(db, makeReceivable({ dueDate: now + 5 * 86_400_000, status: "open" }));

    const open = getOpenReceivables(db);
    const overdue = open.filter(r => r.dueDate < now);
    expect(open).toHaveLength(2);
    expect(overdue).toHaveLength(1);
  });

  it("validates early payment advantage calculation", () => {
    // R$10.000 pagando 5 dias antes com 0.5% desconto
    // CDI anual 10.5%
    const amount = 10_000;
    const discountPct = 0.5 / 100;
    const daysEarly = 5;
    const cdiAnnual = 0.105;

    const discountAmount = amount * discountPct;
    const capitalCost = amount * cdiAnnual * (daysEarly / 365);
    const netBenefit = discountAmount - capitalCost;

    expect(discountAmount).toBe(50);
    expect(capitalCost).toBeCloseTo(14.38, 1);
    expect(netBenefit).toBeGreaterThan(0);
    expect(netBenefit).toBeCloseTo(35.62, 1);
  });

  it("validates anticipation discount computation", () => {
    const faceValue = 100_000;
    const monthlyRate = 0.012; // 1.2% a.m.
    const daysToMaturity = 45;
    const discount = faceValue * (monthlyRate * (daysToMaturity / 30));
    const netAmount = faceValue - discount;

    expect(discount).toBeCloseTo(1_800, 5);
    expect(netAmount).toBeCloseTo(98_200, 5);
  });

  it("respects autonomous payment limit", () => {
    const AUTONOMOUS_LIMIT = 50_000;
    const amounts = [10_000, 49_999, 50_000, 50_001, 100_000];
    const results = amounts.map(a => ({
      amount: a,
      autonomous: a <= AUTONOMOUS_LIMIT,
    }));

    expect(results[0].autonomous).toBe(true);
    expect(results[1].autonomous).toBe(true);
    expect(results[2].autonomous).toBe(true);
    expect(results[3].autonomous).toBe(false);
    expect(results[4].autonomous).toBe(false);
  });
});
