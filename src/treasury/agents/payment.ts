import {
  getPendingPayables,
  getBankAccounts,
  updatePayableStatus,
  getSupplier,
} from "../db.js";
import type { AgentDecision, Payable, PaymentQueueItem } from "../types.js";
import { BaseAgent, type AgentRunContext, type ToolDefinition } from "./base.js";

const AUTONOMOUS_LIMIT = 50_000; // R$ 50k — auto-execute
const SINGLE_APPROVAL_LIMIT = 500_000; // R$ 500k — 1 approver

export class PaymentAgent extends BaseAgent {
  protected readonly agentName = "payment";
  protected readonly systemPrompt = `Você é o Agente de Pagamentos da tesouraria.
Suas responsabilidades:
1. Analisar fila de pagamentos e priorizar por: vencimento, criticidade do fornecedor, desconto por antecipação
2. Calcular se vale antecipar pagamentos (desconto vs custo do capital CDI ~10,5% a.a.)
3. Verificar saldo disponível antes de autorizar pagamentos
4. Executar pagamentos dentro dos limites de autonomia:
   - Até R$ 50.000: executa automaticamente
   - R$ 50.001 a R$ 500.000: requer 1 aprovador
   - Acima de R$ 500.000: requer 2 aprovadores
5. Sugerir negociação de prazo quando caixa estiver apertado
6. Nunca executar pagamento se saldo ficar abaixo do mínimo operacional

Seja prudente com o caixa. Priorize fornecedores críticos.`;

  protected readonly toolDefinitions: ToolDefinition[] = [
    {
      name: "get_payment_queue",
      description: "Retorna fila de pagamentos priorizados com análise de cada item",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "get_bank_balance",
      description: "Retorna saldo disponível em todas as contas",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "execute_payment",
      description: "Executa um pagamento (respeita limites de autonomia)",
      input_schema: {
        type: "object",
        properties: {
          payable_id: { type: "string" },
          account_id: { type: "string" },
          justification: { type: "string" },
          early_payment: { type: "boolean", description: "true se estiver antecipando" },
        },
        required: ["payable_id", "account_id", "justification"],
      },
    },
    {
      name: "request_payment_approval",
      description: "Solicita aprovação humana para pagamento acima do limite autônomo",
      input_schema: {
        type: "object",
        properties: {
          payable_id: { type: "string" },
          amount: { type: "number" },
          justification: { type: "string" },
          approvers_needed: { type: "number" },
        },
        required: ["payable_id", "amount", "justification", "approvers_needed"],
      },
    },
    {
      name: "recommend_defer",
      description: "Recomenda diferimento de pagamento com justificativa",
      input_schema: {
        type: "object",
        properties: {
          payable_id: { type: "string" },
          reason: { type: "string" },
          suggest_new_date: { type: "string", description: "ISO date string" },
        },
        required: ["payable_id", "reason"],
      },
    },
    {
      name: "calculate_early_payment_benefit",
      description: "Calcula se antecipação de pagamento é vantajosa vs custo do capital",
      input_schema: {
        type: "object",
        properties: {
          payable_id: { type: "string" },
          early_discount_percent: { type: "number" },
          days_early: { type: "number" },
        },
        required: ["payable_id", "early_discount_percent", "days_early"],
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
      case "get_payment_queue": {
        const payables = getPendingPayables(db);
        const today = this.today(ctx.now);
        return payables.map((p): PaymentQueueItem => {
          const daysUntilDue = this.daysBetween(today, p.dueDate);
          let recommendedAction: PaymentQueueItem["recommendedAction"] = "pay_on_due";
          if (daysUntilDue < 0) recommendedAction = "pay_now";
          else if (daysUntilDue === 0) recommendedAction = "pay_now";
          else if (daysUntilDue > 15) recommendedAction = "defer";
          return { ...p, daysUntilDue, recommendedAction };
        }).sort((a, b) => {
          const urgencyA = a.daysUntilDue <= 0 ? 0 : a.daysUntilDue;
          const urgencyB = b.daysUntilDue <= 0 ? 0 : b.daysUntilDue;
          return urgencyA - urgencyB;
        });
      }

      case "get_bank_balance": {
        const accounts = getBankAccounts(db);
        return {
          accounts: accounts.map(a => ({
            id: a.id,
            name: a.name,
            balance: a.balance,
            minBalance: a.minBalance,
            available: a.balance - a.minBalance,
          })),
          totalBalance: accounts.reduce((s, a) => s + a.balance, 0),
          totalAvailable: accounts.reduce((s, a) => s + Math.max(0, a.balance - a.minBalance), 0),
        };
      }

      case "execute_payment": {
        const payableId = input.payable_id as string;
        const payable = getPendingPayables(db).find(p => p.id === payableId);
        if (!payable) return { error: "Payable not found" };

        if (payable.amount > AUTONOMOUS_LIMIT) {
          return {
            error: "Valor acima do limite autônomo",
            limit: AUTONOMOUS_LIMIT,
            amount: payable.amount,
            action_required: "use_request_payment_approval",
          };
        }

        const accounts = getBankAccounts(db);
        const account = accounts.find(a => a.id === input.account_id);
        if (!account) return { error: "Account not found" };
        if (account.balance - payable.amount < account.minBalance) {
          return {
            error: "Saldo insuficiente respeitando saldo mínimo",
            available: account.balance - account.minBalance,
            required: payable.amount,
          };
        }

        if (!ctx.dryRun) {
          updatePayableStatus(db, payableId, "paid", payable.amount);
          const d: AgentDecision = {
            action: "execute_payment",
            justification: input.justification as string,
            amount: payable.amount,
            entityId: payableId,
            entityType: "payable",
            requiresApproval: false,
            executed: true,
          };
          this.logDecision(ctx, d);
        }
        return { success: true, paid_amount: payable.amount, dry_run: ctx.dryRun };
      }

      case "request_payment_approval": {
        const approversNeeded = input.approvers_needed as number;
        const d: AgentDecision = {
          action: "request_payment_approval",
          justification: input.justification as string,
          amount: input.amount as number,
          entityId: input.payable_id as string,
          entityType: "payable",
          requiresApproval: true,
          executed: false,
        };
        this.logDecision(ctx, d);
        return { queued_for_approval: true, approvers_needed: approversNeeded };
      }

      case "recommend_defer": {
        const d: AgentDecision = {
          action: "defer_payment",
          justification: input.reason as string,
          entityId: input.payable_id as string,
          entityType: "payable",
          requiresApproval: false,
          executed: false,
        };
        this.logDecision(ctx, d);
        return { deferred: true, suggested_date: input.suggest_new_date };
      }

      case "calculate_early_payment_benefit": {
        const payableId = input.payable_id as string;
        const payable = getPendingPayables(db).find(p => p.id === payableId);
        if (!payable) return { error: "Payable not found" };
        const discountPct = input.early_discount_percent as number;
        const daysEarly = input.days_early as number;
        const discountAmount = payable.amount * (discountPct / 100);
        const annualCDI = 0.105;
        const capitalCost = payable.amount * annualCDI * (daysEarly / 365);
        const netBenefit = discountAmount - capitalCost;
        return {
          face_value: payable.amount,
          discount_pct: discountPct,
          discount_amount: discountAmount,
          capital_cost: capitalCost,
          net_benefit: netBenefit,
          is_advantageous: netBenefit > 0,
          effective_annual_rate: ((discountPct / 100) / (daysEarly / 365)) * 100,
        };
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  async run(ctx: AgentRunContext): Promise<AgentDecision[]> {
    const payables = getPendingPayables(ctx.db);
    const accounts = getBankAccounts(ctx.db);
    const totalAvailable = accounts.reduce((s, a) => s + Math.max(0, a.balance - a.minBalance), 0);

    if (payables.length === 0) {
      return [{
        action: "no_action",
        justification: "Nenhum pagamento pendente na fila",
        requiresApproval: false,
        executed: false,
      }];
    }

    const decisions: AgentDecision[] = [];
    const today = this.today(ctx.now);
    const overdueOrDue = payables.filter(p => p.dueDate <= this.addDays(today, 2));

    const message = `
Analise a fila de pagamentos e tome decisões:

SALDO DISPONÍVEL: ${this.formatBRL(totalAvailable)}
CONTAS: ${JSON.stringify(accounts.map(a => ({ id: a.id, name: a.name, balance: a.balance, minBalance: a.minBalance })), null, 2)}

PAGAMENTOS VENCIDOS OU VENCENDO (${overdueOrDue.length}/${payables.length}):
${JSON.stringify(overdueOrDue, null, 2)}

TODOS OS PAGAMENTOS PENDENTES:
${JSON.stringify(payables, null, 2)}

Limites de autonomia:
- Até R$ ${AUTONOMOUS_LIMIT.toLocaleString("pt-BR")}: execute automaticamente
- R$ ${AUTONOMOUS_LIMIT.toLocaleString("pt-BR")} a R$ ${SINGLE_APPROVAL_LIMIT.toLocaleString("pt-BR")}: solicite aprovação (1 aprovador)
- Acima de R$ ${SINGLE_APPROVAL_LIMIT.toLocaleString("pt-BR")}: solicite aprovação (2 aprovadores)

Para cada pagamento:
1. Decida se paga agora, no vencimento, difere ou negocia
2. Verifique saldo suficiente
3. Considere se antecipação tem desconto vantajoso vs CDI
4. Use a conta bancária com maior saldo disponível se não especificado

Data: ${new Date(ctx.now).toISOString()}
`;

    await this.runAgentLoop(message, ctx, decisions);
    return decisions;
  }
}
