import { randomUUID } from "crypto";
import {
  getOpenReceivables,
  updateReceivableStatus,
  insertCollectionAttempt,
  getCollectionAttempts,
} from "../db.js";
import type { AgentDecision, Receivable, CollectionStage } from "../types.js";
import { BaseAgent, type AgentRunContext, type ToolDefinition } from "./base.js";

const COLLECTION_STAGES: Record<CollectionStage, { daysOverdue: number; channel: string; tone: string }> = {
  none: { daysOverdue: -5, channel: "email", tone: "lembrete amigável" },
  reminder: { daysOverdue: 0, channel: "email+whatsapp", tone: "lembrete com link de pagamento" },
  dunning: { daysOverdue: 3, channel: "whatsapp", tone: "cobrança com oferta de parcelamento" },
  negotiation: { daysOverdue: 10, channel: "phone+email", tone: "proposta de acordo" },
  legal: { daysOverdue: 30, channel: "formal", tone: "protocolo jurídico" },
};

export class ReceivablesAgent extends BaseAgent {
  protected readonly agentName = "receivables";
  protected readonly systemPrompt = `Você é o Agente de Gestão de Recebíveis da tesouraria.
Suas responsabilidades:
1. Monitorar carteira de contas a receber: status, vencimento, histórico de contato
2. Iniciar cobrança proativa antes do vencimento (D-5 lembrete amigável)
3. Escalar cobrança progressivamente: lembrete → dunning → negociação → jurídico
4. Personalizar abordagem por perfil: valor, histórico, segmento do cliente
5. Propor parcelamentos e acordos dentro dos parâmetros (juros padrão 1% a.m.)
6. Identificar clientes com risco de não-pagamento e alertar

Etapas de cobrança:
- D-5: lembrete amigável por e-mail
- D-0 a D+3: lembrete com link de pagamento (e-mail + WhatsApp)
- D+3 a D+10: cobrança com oferta de parcelamento (WhatsApp)
- D+10 a D+30: proposta de acordo (telefone + e-mail)
- D+30+: encaminhamento jurídico (protocolo formal)

Sempre registre cada tentativa de contato.`;

  protected readonly toolDefinitions: ToolDefinition[] = [
    {
      name: "get_receivables_portfolio",
      description: "Retorna carteira de recebíveis em aberto com aging e histórico",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "send_collection_message",
      description: "Envia mensagem de cobrança para o cliente no canal e tom adequado",
      input_schema: {
        type: "object",
        properties: {
          receivable_id: { type: "string" },
          channel: { type: "string", enum: ["email", "whatsapp", "phone"] },
          message: { type: "string" },
          new_stage: {
            type: "string",
            enum: ["none", "reminder", "dunning", "negotiation", "legal"],
          },
        },
        required: ["receivable_id", "channel", "message", "new_stage"],
      },
    },
    {
      name: "register_partial_payment",
      description: "Registra pagamento parcial recebido",
      input_schema: {
        type: "object",
        properties: {
          receivable_id: { type: "string" },
          amount_received: { type: "number" },
          notes: { type: "string" },
        },
        required: ["receivable_id", "amount_received"],
      },
    },
    {
      name: "mark_as_paid",
      description: "Marca recebível como pago",
      input_schema: {
        type: "object",
        properties: {
          receivable_id: { type: "string" },
          amount_received: { type: "number" },
        },
        required: ["receivable_id", "amount_received"],
      },
    },
    {
      name: "escalate_to_legal",
      description: "Encaminha recebível para equipe jurídica",
      input_schema: {
        type: "object",
        properties: {
          receivable_id: { type: "string" },
          justification: { type: "string" },
        },
        required: ["receivable_id", "justification"],
      },
    },
    {
      name: "generate_collection_message",
      description: "Gera mensagem de cobrança personalizada para o cliente",
      input_schema: {
        type: "object",
        properties: {
          customer_name: { type: "string" },
          amount: { type: "number" },
          due_date: { type: "string" },
          days_overdue: { type: "number" },
          stage: { type: "string" },
          offer_installment: { type: "boolean" },
        },
        required: ["customer_name", "amount", "due_date", "days_overdue", "stage"],
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
      case "get_receivables_portfolio": {
        const receivables = getOpenReceivables(db);
        return receivables.map(r => {
          const daysOverdue = this.daysBetween(r.dueDate, today);
          const attempts = getCollectionAttempts(db, r.id);
          return {
            ...r,
            daysOverdue,
            isOverdue: daysOverdue > 0,
            remainingAmount: r.amount - r.receivedAmount,
            lastAttempts: attempts.slice(0, 3),
            suggestedStage: this.suggestStage(daysOverdue),
          };
        });
      }

      case "send_collection_message": {
        const receivableId = input.receivable_id as string;
        const newStage = input.new_stage as CollectionStage;

        if (!ctx.dryRun) {
          const attempt: CollectionAttempt = {
            id: randomUUID(),
            receivableId,
            channel: input.channel as CollectionAttempt["channel"],
            message: input.message as string,
            sentAt: ctx.now,
          };
          insertCollectionAttempt(db, attempt);
          updateReceivableStatus(db, receivableId, "overdue", undefined, newStage);
          const d: AgentDecision = {
            action: "send_collection_message",
            justification: `Enviou cobrança via ${input.channel} — estágio: ${newStage}`,
            entityId: receivableId,
            entityType: "receivable",
            requiresApproval: false,
            executed: true,
          };
          this.logDecision(ctx, d);
        }
        return { sent: true, channel: input.channel, stage: newStage, dry_run: ctx.dryRun };
      }

      case "register_partial_payment": {
        if (!ctx.dryRun) {
          updateReceivableStatus(db, input.receivable_id as string, "partial", input.amount_received as number);
          const d: AgentDecision = {
            action: "register_partial_payment",
            justification: input.notes as string ?? "Pagamento parcial registrado",
            entityId: input.receivable_id as string,
            entityType: "receivable",
            amount: input.amount_received as number,
            requiresApproval: false,
            executed: true,
          };
          this.logDecision(ctx, d);
        }
        return { registered: true, dry_run: ctx.dryRun };
      }

      case "mark_as_paid": {
        if (!ctx.dryRun) {
          updateReceivableStatus(db, input.receivable_id as string, "paid", input.amount_received as number);
          const d: AgentDecision = {
            action: "mark_receivable_paid",
            justification: "Recebível baixado como pago",
            entityId: input.receivable_id as string,
            entityType: "receivable",
            amount: input.amount_received as number,
            requiresApproval: false,
            executed: true,
          };
          this.logDecision(ctx, d);
        }
        return { paid: true, dry_run: ctx.dryRun };
      }

      case "escalate_to_legal": {
        if (!ctx.dryRun) {
          updateReceivableStatus(db, input.receivable_id as string, "overdue", undefined, "legal");
          const d: AgentDecision = {
            action: "escalate_to_legal",
            justification: input.justification as string,
            entityId: input.receivable_id as string,
            entityType: "receivable",
            requiresApproval: true,
            executed: false,
          };
          this.logDecision(ctx, d);
        }
        return { escalated: true, requires_legal_team_action: true };
      }

      case "generate_collection_message": {
        const amount = this.formatBRL(input.amount as number);
        const daysOverdue = input.days_overdue as number;
        const stage = input.stage as string;
        const offerInstallment = input.offer_installment as boolean;
        const dueDate = input.due_date as string;
        const customerName = input.customer_name as string;

        let msg = "";
        if (stage === "none" || stage === "reminder") {
          msg = `Olá ${customerName}, este é um lembrete amigável: você tem um título de ${amount} com vencimento em ${dueDate}. Acesse o link para facilitar o pagamento.`;
        } else if (stage === "dunning") {
          msg = `${customerName}, seu título de ${amount} venceu há ${daysOverdue} dia(s). Regularize agora para evitar juros. ${offerInstallment ? "Podemos parcelar em até 3x sem juros adicionais." : ""}`;
        } else if (stage === "negotiation") {
          msg = `${customerName}, sua dívida de ${amount} está com ${daysOverdue} dias de atraso. Propomos um acordo: entre em contato para regularizar antes que o processo seja encaminhado ao jurídico.`;
        } else {
          msg = `${customerName}, informamos formalmente que o débito de ${amount}, vencido em ${dueDate} (${daysOverdue} dias), foi encaminhado para nosso departamento jurídico. Contate-nos em 48h para evitar medidas legais.`;
        }
        return { message: msg };
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private suggestStage(daysOverdue: number): CollectionStage {
    if (daysOverdue >= 30) return "legal";
    if (daysOverdue >= 10) return "negotiation";
    if (daysOverdue >= 3) return "dunning";
    if (daysOverdue >= -5) return "reminder";
    return "none";
  }

  async run(ctx: AgentRunContext): Promise<AgentDecision[]> {
    const receivables = getOpenReceivables(ctx.db);
    if (receivables.length === 0) {
      return [{
        action: "no_action",
        justification: "Nenhum recebível em aberto",
        requiresApproval: false,
        executed: false,
      }];
    }

    const today = this.today(ctx.now);
    const totalOutstanding = receivables.reduce((s, r) => s + (r.amount - r.receivedAmount), 0);
    const overdue = receivables.filter(r => r.dueDate < today);
    const totalOverdue = overdue.reduce((s, r) => s + (r.amount - r.receivedAmount), 0);

    const decisions: AgentDecision[] = [];
    const message = `
Gerencie a carteira de recebíveis:

RESUMO:
- Total em aberto: ${this.formatBRL(totalOutstanding)}
- Total vencido: ${this.formatBRL(totalOverdue)} (${overdue.length} títulos)

CARTEIRA COMPLETA (${receivables.length} títulos):
${JSON.stringify(receivables.slice(0, 30).map(r => ({
  ...r,
  daysOverdue: this.daysBetween(r.dueDate, today),
  remaining: r.amount - r.receivedAmount,
})), null, 2)}

Para cada recebível:
1. Avalie o estágio de cobrança adequado baseado nos dias de atraso
2. Se ainda não contatou ou último contato foi há mais de 3 dias, envie mensagem
3. Gere mensagem personalizada e adequada ao estágio
4. Escale progressivamente — nunca pule etapas sem justificativa
5. Sinaliza casos para jurídico que ultrapassaram 30 dias com semcontato

Data: ${new Date(ctx.now).toISOString()}
`;

    await this.runAgentLoop(message, ctx, decisions);
    return decisions;
  }
}

// Re-export type for db import
type CollectionAttempt = import("../types.js").CollectionAttempt;
