import { randomUUID } from "crypto";
import {
  getBankAccounts,
  getPendingPayables,
  getOpenReceivables,
  getCashFlowProjections,
  upsertCashFlow,
} from "../db.js";
import type { AgentDecision, CashFlowProjection, CashPosition } from "../types.js";
import { BaseAgent, type AgentRunContext, type ToolDefinition } from "./base.js";

export class CashFlowAgent extends BaseAgent {
  protected readonly agentName = "cash-flow";
  protected readonly systemPrompt = `Você é o Agente de Fluxo de Caixa da tesouraria.
Suas responsabilidades:
1. Consolidar posição de caixa em tempo real (saldos + compromissos + recebimentos previstos)
2. Projetar fluxo de caixa para os próximos 7, 15 e 30 dias
3. Identificar gaps de caixa com antecedência mínima de 7 dias
4. Gerar 3 cenários: pessimista (70% dos recebimentos), base (90%), otimista (100%)
5. Alertar sobre riscos e sugerir ações corretivas
6. Manter projeções atualizadas a cada evento material

Fator de conversão para cenários:
- Pessimista: 70% dos recebimentos previstos
- Base: 90% dos recebimentos previstos (considerando inadimplência histórica ~10%)
- Otimista: 100% dos recebimentos

Alerta vermelho: saldo projetado ≤ 0 em qualquer dia
Alerta amarelo: saldo projetado < saldo mínimo em qualquer dia`;

  protected readonly toolDefinitions: ToolDefinition[] = [
    {
      name: "get_current_position",
      description: "Retorna posição consolidada atual de caixa",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "get_scheduled_outflows",
      description: "Retorna saídas programadas (contas a pagar) por período",
      input_schema: {
        type: "object",
        properties: {
          days: { type: "number" },
        },
      },
    },
    {
      name: "get_expected_inflows",
      description: "Retorna entradas esperadas (contas a receber) por período",
      input_schema: {
        type: "object",
        properties: {
          days: { type: "number" },
        },
      },
    },
    {
      name: "save_projection",
      description: "Salva projeção de fluxo de caixa para uma data",
      input_schema: {
        type: "object",
        properties: {
          projection_date: { type: "number", description: "Timestamp do dia projetado" },
          opening_balance: { type: "number" },
          inflows: { type: "number" },
          outflows: { type: "number" },
          confidence: { type: "string", enum: ["pessimistic", "base", "optimistic"] },
        },
        required: ["projection_date", "opening_balance", "inflows", "outflows", "confidence"],
      },
    },
    {
      name: "get_existing_projections",
      description: "Retorna projeções já salvas para comparação",
      input_schema: {
        type: "object",
        properties: {
          days: { type: "number" },
        },
      },
    },
    {
      name: "raise_alert",
      description: "Emite alerta sobre gap de caixa identificado",
      input_schema: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["yellow", "red"] },
          date: { type: "string" },
          projected_balance: { type: "number" },
          min_required: { type: "number" },
          message: { type: "string" },
          suggested_actions: { type: "array", items: { type: "string" } },
        },
        required: ["severity", "date", "projected_balance", "min_required", "message"],
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
      case "get_current_position": {
        const accounts = getBankAccounts(db);
        const payables = getPendingPayables(db);
        const receivables = getOpenReceivables(db);

        const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
        const pendingOut = payables.reduce((s, p) => s + p.amount, 0);
        const pendingIn = receivables.reduce((s, r) => s + (r.amount - r.receivedAmount), 0);
        const overdueIn = receivables
          .filter(r => r.dueDate < today)
          .reduce((s, r) => s + (r.amount - r.receivedAmount), 0);

        const pos: CashPosition = {
          totalBalance,
          accounts: accounts.map(a => ({ name: a.name, balance: a.balance, currency: a.currency })),
          pendingPayables: pendingOut,
          pendingReceivables: pendingIn,
          overdueReceivables: overdueIn,
          netPosition: totalBalance - pendingOut + pendingIn,
          projectedBalance7d: 0,
          projectedBalance30d: 0,
          asOf: ctx.now,
        };
        return pos;
      }

      case "get_scheduled_outflows": {
        const days = (input.days as number) ?? 30;
        const payables = getPendingPayables(db);
        const horizon = this.addDays(today, days);
        const inPeriod = payables.filter(p => p.dueDate >= today && p.dueDate <= horizon);
        const byDay: Record<string, number> = {};
        for (const p of inPeriod) {
          const key = new Date(p.dueDate).toISOString().slice(0, 10);
          byDay[key] = (byDay[key] ?? 0) + p.amount;
        }
        return {
          total: inPeriod.reduce((s, p) => s + p.amount, 0),
          count: inPeriod.length,
          byDay,
          items: inPeriod.slice(0, 30),
        };
      }

      case "get_expected_inflows": {
        const days = (input.days as number) ?? 30;
        const receivables = getOpenReceivables(db);
        const horizon = this.addDays(today, days);
        const inPeriod = receivables.filter(r => r.dueDate >= today && r.dueDate <= horizon);
        const byDay: Record<string, number> = {};
        for (const r of inPeriod) {
          const key = new Date(r.dueDate).toISOString().slice(0, 10);
          byDay[key] = (byDay[key] ?? 0) + (r.amount - r.receivedAmount);
        }
        return {
          total: inPeriod.reduce((s, r) => s + (r.amount - r.receivedAmount), 0),
          count: inPeriod.length,
          byDay,
          items: inPeriod.slice(0, 30),
        };
      }

      case "save_projection": {
        const cf: CashFlowProjection = {
          id: randomUUID(),
          projectionDate: input.projection_date as number,
          openingBalance: input.opening_balance as number,
          inflows: input.inflows as number,
          outflows: input.outflows as number,
          closingBalance: (input.opening_balance as number) + (input.inflows as number) - (input.outflows as number),
          confidence: input.confidence as CashFlowProjection["confidence"],
          generatedAt: ctx.now,
        };
        if (!ctx.dryRun) upsertCashFlow(db, cf);
        return { saved: true, closing_balance: cf.closingBalance, dry_run: ctx.dryRun };
      }

      case "get_existing_projections": {
        const days = (input.days as number) ?? 30;
        return getCashFlowProjections(db, days);
      }

      case "raise_alert": {
        const d: AgentDecision = {
          action: `cash_flow_alert_${input.severity}`,
          justification: input.message as string,
          requiresApproval: input.severity === "red",
          executed: false,
        };
        this.logDecision(ctx, d);
        return { alert_registered: true, severity: input.severity };
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  async run(ctx: AgentRunContext): Promise<AgentDecision[]> {
    const accounts = getBankAccounts(ctx.db);
    const payables = getPendingPayables(ctx.db);
    const receivables = getOpenReceivables(ctx.db);
    const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
    const totalMin = accounts.reduce((s, a) => s + a.minBalance, 0);

    const decisions: AgentDecision[] = [];
    const message = `
Construa o fluxo de caixa para os próximos 30 dias:

SALDO ATUAL: ${this.formatBRL(totalBalance)} (mínimo: ${this.formatBRL(totalMin)})
CONTAS: ${JSON.stringify(accounts.map(a => ({ id: a.id, name: a.name, balance: a.balance, minBalance: a.minBalance })))}

PAGAMENTOS FUTUROS (${payables.length} total):
${JSON.stringify(payables.slice(0, 20).map(p => ({ id: p.id, amount: p.amount, dueDate: new Date(p.dueDate).toISOString().slice(0, 10), status: p.status })), null, 2)}

RECEBIMENTOS FUTUROS (${receivables.length} total):
${JSON.stringify(receivables.slice(0, 20).map(r => ({ id: r.id, amount: r.amount - r.receivedAmount, dueDate: new Date(r.dueDate).toISOString().slice(0, 10), status: r.status })), null, 2)}

Construa:
1. Projeção dia a dia para os próximos 30 dias (use save_projection para cada dia)
2. Gere os 3 cenários: pessimista, base, otimista
3. Identifique gaps (saldo < mínimo) e emita alertas (raise_alert)
4. Calcule os saldos projetados em 7 e 30 dias

Data base: ${new Date(ctx.now).toISOString()}
`;

    await this.runAgentLoop(message, ctx, decisions);
    return decisions;
  }
}
