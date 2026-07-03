/**
 * ActionableMessageAgent — gera mensagens curtas, objetivas e acionáveis
 * adaptadas ao papel/formato preferido de cada pessoa, a partir de uma
 * pendência (evento a classificar, risco de caixa, solicitação a contador).
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { prisma } from "@/lib/prisma";

export type ActionableMessageInput =
  | {
      kind: "CLASSIFY_EVENT";
      personId: string;
      eventId: string;
    }
  | {
      kind: "CASH_RISK";
      personId: string;
      riskDate: string;
      riskAmount: number;
      recommendationText: string;
    }
  | {
      kind: "ACCOUNTANT_REQUEST";
      personId: string;
      competence: string;
      items: string[];
    };

export type ActionableMessageOutput = { message: string; channel: string | null };

export class ActionableMessageAgent extends BaseAgent<ActionableMessageInput, ActionableMessageOutput> {
  readonly name = "ActionableMessageAgent";
  readonly version = "1.0.0";
  readonly description = "Gera mensagens curtas e acionáveis adaptadas por pessoa.";

  protected async execute(input: ActionableMessageInput): Promise<AgentRunResult<ActionableMessageOutput>> {
    const person = await prisma.person.findUniqueOrThrow({ where: { id: input.personId } });
    const firstName = person.name.split(" ")[0];
    let message = "";

    if (input.kind === "CLASSIFY_EVENT") {
      const event = await prisma.financialEvent.findUniqueOrThrow({ where: { id: input.eventId } });
      const dateLabel = event.financialDate ? event.financialDate.toISOString().slice(0, 10) : "data não informada";
      message = `${firstName}, pode confirmar este lançamento? ${dateLabel} — R$ ${Number(event.netAmount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} — ${event.counterpartyName ?? "contraparte não identificada"}. Foi: 1) custo de projeto, 2) despesa administrativa, 3) investimento/equipamento, ou 4) pagamento de dívida/atraso?`;
    } else if (input.kind === "CASH_RISK") {
      message = `Há risco de caixa negativo de R$ ${input.riskAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em ${input.riskDate} no cenário conservador. Recomendação: ${input.recommendationText}. Decisão necessária: autorizar hoje?`;
    } else {
      message = `Favor enviar, para competência ${input.competence}: ${input.items.join(", ")}.`;
    }

    return {
      output: { message, channel: person.preferredChannel },
      confidence: 0.85,
      warnings: person.preferredChannel ? [] : [{ code: "NO_CHANNEL", message: "Canal preferido não definido — usando canal padrão." }],
      errors: [],
      ruleBasedMode: true,
    };
  }
}
