import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getDb } from "../store/db.js";
import {
  upsertBankAccount,
  upsertSupplier,
  upsertPayable,
  upsertReceivable,
  getBankAccounts,
  getPendingPayables,
  getOpenReceivables,
  getCashFlowProjections,
  getPendingApprovals,
  approveAgentLog,
  getUnreconciledTransactions,
  updatePayableStatus,
  updateReceivableStatus,
} from "./db.js";
import type { BankAccount, Supplier, Payable, Receivable } from "./types.js";
import { TreasuryOrchestrator } from "./agents/orchestrator.js";

const orchestrator = new TreasuryOrchestrator();

export function registerTreasuryTools(server: McpServer): void {
  // ── Rotina Diária ────────────────────────────────────────────────────────────

  server.tool(
    "treasury_run_daily_routine",
    "Executa a rotina diária completa de tesouraria: conciliação, fluxo de caixa, antecipações, pagamentos e cobranças",
    {
      dry_run: z.boolean().optional().default(false).describe("Simula sem executar ações reais"),
      agents: z.array(
        z.enum(["reconciliation", "payment", "receivables", "anticipation", "cashflow"])
      ).optional().describe("Subconjunto de agentes a executar (padrão: todos)"),
    },
    async ({ dry_run, agents }) => {
      const results = await orchestrator.runDailyRoutine({
        dryRun: dry_run,
        agents: agents as OrchestratorRunOptions["agents"],
      });
      const summary = results.map(r => ({
        agent: r.agent,
        executed: r.executedCount,
        pendingApproval: r.pendingApprovalCount,
        decisions: r.decisions.length,
      }));
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ status: "complete", dry_run, summary, results }, null, 2),
        }],
      };
    }
  );

  // ── Posição de Caixa ─────────────────────────────────────────────────────────

  server.tool(
    "treasury_get_cash_position",
    "Retorna posição consolidada de caixa: saldos, a pagar, a receber, projeções",
    {},
    async () => {
      const db = getDb();
      const accounts = getBankAccounts(db);
      const payables = getPendingPayables(db);
      const receivables = getOpenReceivables(db);
      const projections = getCashFlowProjections(db, 30);

      const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
      const totalMin = accounts.reduce((s, a) => s + a.minBalance, 0);
      const pendingOut = payables.reduce((s, p) => s + p.amount, 0);
      const pendingIn = receivables.reduce((s, r) => s + (r.amount - r.receivedAmount), 0);
      const now = Date.now();
      const overdueIn = receivables
        .filter(r => r.dueDate < now)
        .reduce((s, r) => s + (r.amount - r.receivedAmount), 0);

      const proj7 = projections.find(p => p.projectionDate >= now + 7 * 86_400_000);
      const proj30 = projections[projections.length - 1];

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            totalBalance,
            available: totalBalance - totalMin,
            accounts: accounts.map(a => ({
              name: a.name, bankCode: a.bankCode,
              balance: a.balance, minBalance: a.minBalance,
              available: a.balance - a.minBalance,
            })),
            pendingPayables: pendingOut,
            pendingReceivables: pendingIn,
            overdueReceivables: overdueIn,
            netPosition: totalBalance - pendingOut + pendingIn,
            projectedBalance7d: proj7?.closingBalance ?? null,
            projectedBalance30d: proj30?.closingBalance ?? null,
            asOf: new Date(now).toISOString(),
          }, null, 2),
        }],
      };
    }
  );

  // ── Contas Bancárias ─────────────────────────────────────────────────────────

  server.tool(
    "treasury_add_bank_account",
    "Cadastra ou atualiza uma conta bancária",
    {
      id: z.string().optional().describe("ID existente para atualização"),
      name: z.string(),
      bank_code: z.string().describe("Código do banco (ex: 341 Itaú)"),
      agency: z.string(),
      account_number: z.string(),
      balance: z.number().describe("Saldo inicial em BRL"),
      min_balance: z.number().default(0).describe("Saldo mínimo operacional"),
      currency: z.enum(["BRL", "USD", "EUR"]).default("BRL"),
    },
    async ({ id, name, bank_code, agency, account_number, balance, min_balance, currency }) => {
      const db = getDb();
      const account: BankAccount = {
        id: id ?? randomUUID(),
        name,
        bankCode: bank_code,
        agency,
        accountNumber: account_number,
        balance,
        minBalance: min_balance,
        currency,
        isActive: true,
        updatedAt: Date.now(),
      };
      upsertBankAccount(db, account);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, account }) }] };
    }
  );

  server.tool(
    "treasury_list_bank_accounts",
    "Lista todas as contas bancárias ativas",
    {},
    async () => {
      const db = getDb();
      const accounts = getBankAccounts(db);
      return { content: [{ type: "text", text: JSON.stringify(accounts, null, 2) }] };
    }
  );

  // ── Fornecedores ─────────────────────────────────────────────────────────────

  server.tool(
    "treasury_add_supplier",
    "Cadastra ou atualiza um fornecedor",
    {
      id: z.string().optional(),
      name: z.string(),
      cnpj: z.string().optional(),
      payment_terms: z.number().default(30).describe("Prazo de pagamento padrão em dias"),
      criticality: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      contact_email: z.string().optional(),
      contact_phone: z.string().optional(),
    },
    async ({ id, name, cnpj, payment_terms, criticality, contact_email, contact_phone }) => {
      const db = getDb();
      const supplier: Supplier = {
        id: id ?? randomUUID(),
        name,
        cnpj,
        paymentTerms: payment_terms,
        criticality,
        contactEmail: contact_email,
        contactPhone: contact_phone,
        isActive: true,
        createdAt: Date.now(),
      };
      upsertSupplier(db, supplier);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, supplier }) }] };
    }
  );

  // ── Contas a Pagar ───────────────────────────────────────────────────────────

  server.tool(
    "treasury_add_payable",
    "Registra uma conta a pagar (fornecedor, boleto, etc.)",
    {
      id: z.string().optional(),
      supplier_id: z.string().optional(),
      description: z.string(),
      amount: z.number(),
      due_date: z.string().describe("Data de vencimento ISO8601 (YYYY-MM-DD)"),
      invoice_number: z.string().optional(),
      notes: z.string().optional(),
      auto_approve: z.boolean().default(false).describe("Aprovação automática para pagamentos de rotina"),
    },
    async ({ id, supplier_id, description, amount, due_date, invoice_number, notes, auto_approve }) => {
      const db = getDb();
      const payable: Payable = {
        id: id ?? randomUUID(),
        supplierId: supplier_id,
        description,
        amount,
        dueDate: new Date(due_date).getTime(),
        status: "pending",
        invoiceNumber: invoice_number,
        notes,
        autoApprove: auto_approve,
        createdAt: Date.now(),
      };
      upsertPayable(db, payable);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, payable }) }] };
    }
  );

  server.tool(
    "treasury_list_pending_payments",
    "Lista pagamentos pendentes com priorização por vencimento",
    {
      overdue_only: z.boolean().optional().default(false),
    },
    async ({ overdue_only }) => {
      const db = getDb();
      const payables = getPendingPayables(db);
      const now = Date.now();
      const filtered = overdue_only ? payables.filter(p => p.dueDate < now) : payables;
      return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
    }
  );

  server.tool(
    "treasury_approve_payment",
    "Aprova manualmente um pagamento (para valores acima do limite autônomo)",
    {
      payable_id: z.string(),
      approved_by: z.string().describe("Nome do aprovador"),
      account_id: z.string().optional().describe("Conta para débito"),
    },
    async ({ payable_id, approved_by, account_id }) => {
      const db = getDb();
      updatePayableStatus(db, payable_id, "approved");
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ approved: true, payable_id, approved_by, account_id }),
        }],
      };
    }
  );

  // ── Contas a Receber ─────────────────────────────────────────────────────────

  server.tool(
    "treasury_add_receivable",
    "Registra uma conta a receber (cliente, NF, etc.)",
    {
      id: z.string().optional(),
      customer_name: z.string(),
      customer_cnpj: z.string().optional(),
      customer_email: z.string().optional(),
      customer_phone: z.string().optional(),
      description: z.string(),
      amount: z.number(),
      due_date: z.string().describe("Data de vencimento ISO8601 (YYYY-MM-DD)"),
      invoice_number: z.string().optional(),
      can_anticipate: z.boolean().default(true),
    },
    async ({ id, customer_name, customer_cnpj, customer_email, customer_phone, description, amount, due_date, invoice_number, can_anticipate }) => {
      const db = getDb();
      const receivable: Receivable = {
        id: id ?? randomUUID(),
        customerName: customer_name,
        customerCnpj: customer_cnpj,
        customerEmail: customer_email,
        customerPhone: customer_phone,
        description,
        amount,
        dueDate: new Date(due_date).getTime(),
        status: "open",
        receivedAmount: 0,
        collectionStage: "none",
        invoiceNumber: invoice_number,
        canAnticipate: can_anticipate,
        createdAt: Date.now(),
      };
      upsertReceivable(db, receivable);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, receivable }) }] };
    }
  );

  server.tool(
    "treasury_list_receivables",
    "Lista contas a receber em aberto com aging",
    {
      overdue_only: z.boolean().optional().default(false),
    },
    async ({ overdue_only }) => {
      const db = getDb();
      const receivables = getOpenReceivables(db);
      const now = Date.now();
      const filtered = overdue_only ? receivables.filter(r => r.dueDate < now) : receivables;
      return {
        content: [{
          type: "text",
          text: JSON.stringify(filtered.map(r => ({
            ...r,
            daysOverdue: Math.max(0, Math.round((now - r.dueDate) / 86_400_000)),
            remaining: r.amount - r.receivedAmount,
          })), null, 2),
        }],
      };
    }
  );

  server.tool(
    "treasury_register_payment_received",
    "Registra recebimento de pagamento de cliente",
    {
      receivable_id: z.string(),
      amount_received: z.number(),
      full_payment: z.boolean().default(true),
    },
    async ({ receivable_id, amount_received, full_payment }) => {
      const db = getDb();
      updateReceivableStatus(db, receivable_id, full_payment ? "paid" : "partial", amount_received);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, receivable_id, amount_received }) }] };
    }
  );

  // ── Extrato Bancário ─────────────────────────────────────────────────────────

  server.tool(
    "treasury_ingest_bank_statement",
    "Importa lançamentos de extrato bancário para conciliação",
    {
      account_id: z.string(),
      entries: z.array(z.object({
        date: z.string().describe("ISO date YYYY-MM-DD"),
        amount: z.number(),
        description: z.string(),
        type: z.enum(["credit", "debit"]),
      })),
    },
    async ({ account_id, entries }) => {
      const db = getDb();
      const ctx = { db, now: Date.now() };
      const recon = orchestrator.getBankReconciliationAgent();
      const mapped = entries.map(e => ({
        date: new Date(e.date).getTime(),
        amount: e.amount,
        description: e.description,
        type: e.type as "credit" | "debit",
      }));
      const count = recon.ingestBankStatement(ctx, account_id, mapped);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, inserted: count }) }] };
    }
  );

  server.tool(
    "treasury_list_unreconciled",
    "Lista lançamentos bancários não conciliados",
    {
      account_id: z.string().optional(),
    },
    async ({ account_id }) => {
      const db = getDb();
      const txs = getUnreconciledTransactions(db, account_id);
      return { content: [{ type: "text", text: JSON.stringify(txs, null, 2) }] };
    }
  );

  // ── Aprovações ───────────────────────────────────────────────────────────────

  server.tool(
    "treasury_list_pending_approvals",
    "Lista decisões dos agentes que aguardam aprovação humana",
    {},
    async () => {
      const db = getDb();
      const approvals = getPendingApprovals(db);
      return { content: [{ type: "text", text: JSON.stringify(approvals, null, 2) }] };
    }
  );

  server.tool(
    "treasury_approve_agent_decision",
    "Aprova uma decisão pendente de um agente de IA",
    {
      log_id: z.string(),
      approved_by: z.string(),
    },
    async ({ log_id, approved_by }) => {
      const db = getDb();
      approveAgentLog(db, log_id, approved_by);
      return { content: [{ type: "text", text: JSON.stringify({ approved: true, log_id, approved_by }) }] };
    }
  );

  // ── Fluxo de Caixa ───────────────────────────────────────────────────────────

  server.tool(
    "treasury_get_cash_flow",
    "Retorna projeções de fluxo de caixa",
    {
      days: z.number().default(30),
    },
    async ({ days }) => {
      const db = getDb();
      const projections = getCashFlowProjections(db, days);
      return { content: [{ type: "text", text: JSON.stringify(projections, null, 2) }] };
    }
  );

  // ── Status dos Agentes ───────────────────────────────────────────────────────

  server.tool(
    "treasury_agent_health",
    "Retorna status de saúde dos agentes de tesouraria e resumo das últimas execuções",
    {},
    async () => {
      const db = getDb();
      const recentLogs = (db.prepare(`
        SELECT agent, COUNT(*) as total,
               SUM(executed) as executed,
               SUM(requires_approval) as requires_approval,
               MAX(created_at) as last_run
        FROM treasury_agent_logs
        WHERE created_at > ?
        GROUP BY agent
      `).all(Date.now() - 86_400_000) as Record<string, unknown>[]);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "healthy",
            agents: ["bank-reconciliation", "payment", "receivables", "anticipation", "cash-flow"],
            last24h: recentLogs,
            pendingApprovals: getPendingApprovals(db).length,
            asOf: new Date().toISOString(),
          }, null, 2),
        }],
      };
    }
  );
}

type OrchestratorRunOptions = import("./agents/orchestrator.js").OrchestratorRunOptions;
