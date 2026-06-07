import { randomUUID } from "crypto";
import {
  getBankAccounts,
  getPendingPayables,
  getOpenReceivables,
  insertTransaction,
  getUnreconciledTransactions,
  markTransactionReconciled,
  updateAccountBalance,
  updatePayableStatus,
  updateReceivableStatus,
} from "../db.js";
import type { AgentDecision, BankTransaction } from "../types.js";
import { BaseAgent, type AgentRunContext, type ToolDefinition } from "./base.js";

export class BankReconciliationAgent extends BaseAgent {
  protected readonly agentName = "bank-reconciliation";
  protected readonly systemPrompt = `Você é o Agente de Conciliação Bancária da tesouraria.
Suas responsabilidades:
1. Analisar extratos bancários e identificar lançamentos não conciliados
2. Cruzar lançamentos com contas a pagar e receber no sistema
3. Detectar anomalias: tarifas indevidas, duplicidades, valores divergentes
4. Registrar conciliações e atualizar saldos
5. Gerar alertas para o tesoureiro sobre exceções que não conseguiu resolver

Seja preciso e conservador. Só concilie quando tiver certeza. Documente sua justificativa.
Sempre prefira não conciliar do que fazer uma conciliação errada.`;

  protected readonly toolDefinitions: ToolDefinition[] = [
    {
      name: "get_bank_accounts",
      description: "Retorna todas as contas bancárias ativas com saldo atual",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "get_unreconciled_transactions",
      description: "Retorna lançamentos bancários ainda não conciliados",
      input_schema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "ID da conta (opcional, omitir para todas)" },
        },
      },
    },
    {
      name: "get_pending_payables",
      description: "Retorna contas a pagar pendentes ou aprovadas",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "get_open_receivables",
      description: "Retorna contas a receber em aberto",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "reconcile_transaction_with_payable",
      description: "Concilia um lançamento de débito bancário com uma conta a pagar",
      input_schema: {
        type: "object",
        properties: {
          transaction_id: { type: "string" },
          payable_id: { type: "string" },
          justification: { type: "string" },
        },
        required: ["transaction_id", "payable_id", "justification"],
      },
    },
    {
      name: "reconcile_transaction_with_receivable",
      description: "Concilia um lançamento de crédito bancário com uma conta a receber",
      input_schema: {
        type: "object",
        properties: {
          transaction_id: { type: "string" },
          receivable_id: { type: "string" },
          received_amount: { type: "number" },
          justification: { type: "string" },
        },
        required: ["transaction_id", "receivable_id", "received_amount", "justification"],
      },
    },
    {
      name: "flag_anomaly",
      description: "Registra uma anomalia detectada que precisa de revisão humana",
      input_schema: {
        type: "object",
        properties: {
          transaction_id: { type: "string" },
          anomaly_type: {
            type: "string",
            enum: ["duplicate", "unauthorized_fee", "amount_mismatch", "unknown_origin", "other"],
          },
          description: { type: "string" },
        },
        required: ["transaction_id", "anomaly_type", "description"],
      },
    },
  ];

  protected async handleToolCall(
    toolName: string,
    input: Record<string, unknown>,
    ctx: AgentRunContext
  ): Promise<unknown> {
    const { db } = ctx;

    switch (toolName) {
      case "get_bank_accounts":
        return getBankAccounts(db);

      case "get_unreconciled_transactions":
        return getUnreconciledTransactions(db, input.account_id as string | undefined);

      case "get_pending_payables":
        return getPendingPayables(db);

      case "get_open_receivables":
        return getOpenReceivables(db);

      case "reconcile_transaction_with_payable": {
        if (ctx.dryRun) return { success: true, dry_run: true };
        const txId = input.transaction_id as string;
        const payableId = input.payable_id as string;
        markTransactionReconciled(db, txId, payableId);
        updatePayableStatus(db, payableId, "paid");
        const d: AgentDecision = {
          action: "reconcile_payable",
          justification: input.justification as string,
          entityId: payableId,
          entityType: "payable",
          requiresApproval: false,
          executed: true,
        };
        this.logDecision(ctx, d);
        return { success: true, payable_id: payableId };
      }

      case "reconcile_transaction_with_receivable": {
        if (ctx.dryRun) return { success: true, dry_run: true };
        const txId = input.transaction_id as string;
        const receivableId = input.receivable_id as string;
        const receivedAmount = input.received_amount as number;
        markTransactionReconciled(db, txId, receivableId);
        updateReceivableStatus(db, receivableId, "paid", receivedAmount);
        const d: AgentDecision = {
          action: "reconcile_receivable",
          justification: input.justification as string,
          entityId: receivableId,
          entityType: "receivable",
          amount: receivedAmount,
          requiresApproval: false,
          executed: true,
        };
        this.logDecision(ctx, d);
        return { success: true, receivable_id: receivableId };
      }

      case "flag_anomaly": {
        const d: AgentDecision = {
          action: "flag_anomaly",
          justification: `Anomalia: ${input.anomaly_type} — ${input.description}`,
          entityId: input.transaction_id as string,
          entityType: "bank_transaction",
          requiresApproval: true,
          executed: false,
        };
        this.logDecision(ctx, d);
        return { flagged: true, requires_human_review: true };
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  async run(ctx: AgentRunContext): Promise<AgentDecision[]> {
    const accounts = getBankAccounts(ctx.db);
    const unreconciled = getUnreconciledTransactions(ctx.db);
    const pendingPayables = getPendingPayables(ctx.db);
    const openReceivables = getOpenReceivables(ctx.db);

    if (unreconciled.length === 0) {
      return [{
        action: "no_action",
        justification: "Nenhum lançamento pendente de conciliação",
        requiresApproval: false,
        executed: false,
      }];
    }

    const decisions: AgentDecision[] = [];
    const message = `
Realize a conciliação bancária para os seguintes dados:

CONTAS BANCÁRIAS:
${JSON.stringify(accounts, null, 2)}

LANÇAMENTOS NÃO CONCILIADOS (${unreconciled.length}):
${JSON.stringify(unreconciled, null, 2)}

CONTAS A PAGAR PENDENTES (${pendingPayables.length}):
${JSON.stringify(pendingPayables.slice(0, 20), null, 2)}

CONTAS A RECEBER EM ABERTO (${openReceivables.length}):
${JSON.stringify(openReceivables.slice(0, 20), null, 2)}

Analise cada lançamento:
1. Tente conciliar débitos com contas a pagar (compare valor, data ±3 dias, descrição)
2. Tente conciliar créditos com contas a receber (compare valor, data ±5 dias)
3. Sinalize anomalias que não conseguiu resolver
4. Seja conservador — só concilie quando tiver ≥ 85% de confiança

Data atual: ${new Date(ctx.now).toISOString()}
`;

    await this.runAgentLoop(message, ctx, decisions);
    return decisions;
  }

  // Inject a bank statement (simulate Open Finance import)
  ingestBankStatement(
    ctx: AgentRunContext,
    accountId: string,
    entries: Array<{ date: number; amount: number; description: string; type: "credit" | "debit" }>
  ): number {
    let inserted = 0;
    for (const e of entries) {
      const tx: BankTransaction = {
        id: randomUUID(),
        accountId,
        date: e.date,
        amount: e.amount,
        description: e.description,
        type: e.type,
        reconciled: false,
        createdAt: ctx.now,
      };
      insertTransaction(ctx.db, tx);
      inserted++;
    }
    // Update account balance
    const debits = entries.filter(e => e.type === "debit").reduce((s, e) => s + e.amount, 0);
    const credits = entries.filter(e => e.type === "credit").reduce((s, e) => s + e.amount, 0);
    const accounts = getBankAccounts(ctx.db);
    const acc = accounts.find(a => a.id === accountId);
    if (acc) {
      updateAccountBalance(ctx.db, accountId, acc.balance + credits - debits);
    }
    return inserted;
  }
}
