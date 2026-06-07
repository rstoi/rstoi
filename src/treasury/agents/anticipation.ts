import { randomUUID } from "crypto";
import {
  getOpenReceivables,
  getBankAccounts,
  insertAnticipation,
  updateAnticipationStatus,
  updateReceivableStatus,
  updateAccountBalance,
} from "../db.js";
import type { AgentDecision, Anticipation } from "../types.js";
import { BaseAgent, type AgentRunContext, type ToolDefinition } from "./base.js";

const MAX_AUTONOMOUS_ANTICIPATION = 200_000; // R$ 200k
const CDI_ANNUAL = 0.105;
const MAX_ACCEPTABLE_RATE = 0.018; // 1,8% a.m. máximo

interface Provider {
  name: string;
  monthlyRate: number;
  minAmount: number;
  maxAmount: number;
  avgDays: number;
}

const PROVIDERS: Provider[] = [
  { name: "Banco Itaú - Desconto Duplicata", monthlyRate: 0.012, minAmount: 5000, maxAmount: 2_000_000, avgDays: 2 },
  { name: "BMP - FIDC", monthlyRate: 0.014, minAmount: 10000, maxAmount: 5_000_000, avgDays: 3 },
  { name: "Creditas Empresas", monthlyRate: 0.015, minAmount: 20000, maxAmount: 1_000_000, avgDays: 1 },
  { name: "Banco Bradesco - Nota Promissória", monthlyRate: 0.016, minAmount: 50000, maxAmount: 3_000_000, avgDays: 5 },
];

export class AnticipationAgent extends BaseAgent {
  protected readonly agentName = "anticipation";
  protected readonly systemPrompt = `Você é o Agente de Antecipação de Recebíveis da tesouraria.
Suas responsabilidades:
1. Monitorar necessidade de caixa vs recebíveis disponíveis para antecipação
2. Avaliar quando a antecipação é economicamente vantajosa:
   - Compara custo da antecipação (taxa do banco) com custo do capital (CDI ~10,5% a.a.)
   - Só antecipa se a taxa for melhor que o custo alternativo de captação
3. Selecionar o provedor mais barato para o prazo e volume necessário
4. Executar antecipações até R$ 200.000 de forma autônoma
5. Para antecipações maiores, apresentar análise e solicitar aprovação
6. Nunca antecipar o mesmo recebível duas vezes

Critérios de decisão:
- Antecipa quando projeção de saldo cai abaixo do mínimo nos próximos 7 dias
- Taxa máxima aceitável: 1,8% a.m.
- Prefere recebíveis de maior valor e menor prazo residual`;

  protected readonly toolDefinitions: ToolDefinition[] = [
    {
      name: "get_anticipatable_receivables",
      description: "Retorna recebíveis que podem ser antecipados com análise de custo",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "get_cash_need",
      description: "Calcula necessidade de caixa para os próximos N dias",
      input_schema: {
        type: "object",
        properties: {
          days: { type: "number", description: "Horizon de dias (padrão 7)" },
        },
      },
    },
    {
      name: "compare_providers",
      description: "Compara provedores de antecipação para um valor e prazo",
      input_schema: {
        type: "object",
        properties: {
          amount: { type: "number" },
          days_to_maturity: { type: "number" },
        },
        required: ["amount", "days_to_maturity"],
      },
    },
    {
      name: "execute_anticipation",
      description: "Executa antecipação de recebível com o provedor escolhido",
      input_schema: {
        type: "object",
        properties: {
          receivable_id: { type: "string" },
          provider_name: { type: "string" },
          bank_account_id: { type: "string" },
          justification: { type: "string" },
        },
        required: ["receivable_id", "provider_name", "bank_account_id", "justification"],
      },
    },
    {
      name: "request_anticipation_approval",
      description: "Solicita aprovação para antecipação acima do limite autônomo",
      input_schema: {
        type: "object",
        properties: {
          receivable_id: { type: "string" },
          amount: { type: "number" },
          provider_name: { type: "string" },
          rate: { type: "number" },
          justification: { type: "string" },
        },
        required: ["receivable_id", "amount", "provider_name", "rate", "justification"],
      },
    },
  ];

  protected async handleToolCall(
    toolName: string,
    input: Record<string, unknown>,
    ctx: AgentRunContext
  ): Promise<unknown> {
    const { db } = ctx;
    const today = this.today(ctx.now);

    switch (toolName) {
      case "get_anticipatable_receivables": {
        const receivables = getOpenReceivables(db);
        return receivables
          .filter(r => r.canAnticipate && r.status !== "paid")
          .map(r => {
            const daysToMaturity = this.daysBetween(today, r.dueDate);
            const bestProvider = PROVIDERS
              .filter(p => p.minAmount <= r.amount && p.maxAmount >= r.amount)
              .sort((a, b) => a.monthlyRate - b.monthlyRate)[0];
            const discountAmount = bestProvider
              ? r.amount * (bestProvider.monthlyRate * (daysToMaturity / 30))
              : null;
            return {
              id: r.id,
              customerName: r.customerName,
              amount: r.amount,
              dueDate: r.dueDate,
              daysToMaturity,
              anticipatedAmount: bestProvider ? r.amount - (discountAmount ?? 0) : null,
              discountAmount,
              bestProviderRate: bestProvider?.monthlyRate,
              bestProvider: bestProvider?.name,
              isAdvantageous: bestProvider ? bestProvider.monthlyRate < MAX_ACCEPTABLE_RATE : false,
            };
          })
          .sort((a, b) => (b.amount - a.amount));
      }

      case "get_cash_need": {
        const days = (input.days as number) ?? 7;
        const accounts = getBankAccounts(db);
        const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
        const totalMin = accounts.reduce((s, a) => s + a.minBalance, 0);
        const available = totalBalance - totalMin;
        return {
          current_balance: totalBalance,
          min_balance: totalMin,
          available: available,
          is_below_minimum: available < 0,
          horizon_days: days,
          needs_anticipation: available < 50_000,
        };
      }

      case "compare_providers": {
        const amount = input.amount as number;
        const days = input.days_to_maturity as number;
        return PROVIDERS
          .filter(p => p.minAmount <= amount && p.maxAmount >= amount)
          .map(p => ({
            name: p.name,
            monthlyRate: p.monthlyRate,
            annualRate: p.monthlyRate * 12,
            discountAmount: amount * (p.monthlyRate * (days / 30)),
            netAmount: amount - amount * (p.monthlyRate * (days / 30)),
            avgApprovalDays: p.avgDays,
            isWithinLimit: p.monthlyRate <= MAX_ACCEPTABLE_RATE,
          }))
          .sort((a, b) => a.monthlyRate - b.monthlyRate);
      }

      case "execute_anticipation": {
        const receivableId = input.receivable_id as string;
        const receivable = getOpenReceivables(db).find(r => r.id === receivableId);
        if (!receivable) return { error: "Receivable not found" };
        if (!receivable.canAnticipate) return { error: "Receivable not eligible for anticipation" };

        const provider = PROVIDERS.find(p => p.name === input.provider_name as string);
        if (!provider) return { error: "Provider not found" };

        const daysToMaturity = this.daysBetween(today, receivable.dueDate);
        const discountRate = provider.monthlyRate * (daysToMaturity / 30);
        const anticipatedAmount = receivable.amount * (1 - discountRate);

        if (receivable.amount > MAX_AUTONOMOUS_ANTICIPATION) {
          return {
            error: "Valor acima do limite autônomo",
            limit: MAX_AUTONOMOUS_ANTICIPATION,
            action_required: "use_request_anticipation_approval",
          };
        }

        if (!ctx.dryRun) {
          const anticipation: Anticipation = {
            id: randomUUID(),
            receivableId,
            faceValue: receivable.amount,
            anticipatedAmount,
            discountRate,
            provider: input.provider_name as string,
            status: "executed",
            bankAccountId: input.bank_account_id as string,
            requestedAt: ctx.now,
            executedAt: ctx.now,
          };
          insertAnticipation(db, anticipation);
          updateReceivableStatus(db, receivableId, "paid", receivable.amount, undefined);

          const accounts = getBankAccounts(db);
          const account = accounts.find(a => a.id === input.bank_account_id as string);
          if (account) {
            updateAccountBalance(db, account.id, account.balance + anticipatedAmount);
          }

          const d: AgentDecision = {
            action: "execute_anticipation",
            justification: input.justification as string,
            amount: anticipatedAmount,
            entityId: receivableId,
            entityType: "receivable",
            requiresApproval: false,
            executed: true,
          };
          this.logDecision(ctx, d);
        }

        return {
          success: true,
          face_value: receivable.amount,
          anticipated_amount: anticipatedAmount,
          discount: receivable.amount - anticipatedAmount,
          provider: input.provider_name,
          dry_run: ctx.dryRun,
        };
      }

      case "request_anticipation_approval": {
        const d: AgentDecision = {
          action: "request_anticipation_approval",
          justification: input.justification as string,
          amount: input.amount as number,
          entityId: input.receivable_id as string,
          entityType: "receivable",
          requiresApproval: true,
          executed: false,
        };
        this.logDecision(ctx, d);
        return { queued_for_approval: true };
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  async run(ctx: AgentRunContext): Promise<AgentDecision[]> {
    const accounts = getBankAccounts(ctx.db);
    const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
    const totalMin = accounts.reduce((s, a) => s + a.minBalance, 0);
    const available = totalBalance - totalMin;
    const receivables = getOpenReceivables(ctx.db).filter(r => r.canAnticipate);

    if (receivables.length === 0 || available >= 100_000) {
      return [{
        action: "no_action",
        justification: `Caixa adequado (${this.formatBRL(available)} disponível) ou sem recebíveis antecipáveis`,
        requiresApproval: false,
        executed: false,
      }];
    }

    const decisions: AgentDecision[] = [];
    const message = `
Analise a necessidade de antecipação de recebíveis:

POSIÇÃO DE CAIXA:
- Saldo total: ${this.formatBRL(totalBalance)}
- Saldo mínimo: ${this.formatBRL(totalMin)}
- Disponível: ${this.formatBRL(available)}
- Status: ${available < 0 ? "CRÍTICO — ABAIXO DO MÍNIMO" : available < 50_000 ? "ATENÇÃO — SALDO BAIXO" : "OK"}

CONTAS: ${JSON.stringify(accounts.map(a => ({ id: a.id, name: a.name, balance: a.balance, minBalance: a.minBalance })))}

RECEBÍVEIS ANTECIPÁVEIS (${receivables.length}):
${JSON.stringify(receivables.slice(0, 15), null, 2)}

Taxa máxima aceitável: ${(MAX_ACCEPTABLE_RATE * 100).toFixed(1)}% a.m.
Limite autônomo: ${this.formatBRL(MAX_AUTONOMOUS_ANTICIPATION)}

Decida:
1. Qual o volume necessário de antecipação?
2. Quais recebíveis antecipar (prefira maior valor, menor prazo residual)?
3. Qual provedor usar (use compare_providers para comparar)?
4. Execute antecipações dentro do limite ou solicite aprovação

Data: ${new Date(ctx.now).toISOString()}
`;

    await this.runAgentLoop(message, ctx, decisions);
    return decisions;
  }
}
