import Anthropic from "@anthropic-ai/sdk";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { insertAgentLog } from "../db.js";
import type { AgentDecision } from "../types.js";

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface AgentRunContext {
  db: Database.Database;
  now: number;
  dryRun?: boolean;
}

export abstract class BaseAgent {
  protected abstract readonly agentName: string;
  protected abstract readonly systemPrompt: string;
  protected abstract readonly toolDefinitions: ToolDefinition[];

  protected readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  protected abstract handleToolCall(
    toolName: string,
    toolInput: Record<string, unknown>,
    ctx: AgentRunContext
  ): Promise<unknown>;

  abstract run(ctx: AgentRunContext): Promise<AgentDecision[]>;

  protected logDecision(ctx: AgentRunContext, decision: AgentDecision): string {
    const id = randomUUID();
    insertAgentLog(ctx.db, {
      id,
      agent: this.agentName,
      action: decision.action,
      decision: JSON.stringify(decision),
      justification: decision.justification,
      amount: decision.amount,
      entityId: decision.entityId,
      entityType: decision.entityType,
      requiresApproval: decision.requiresApproval,
      executed: decision.executed ?? false,
      createdAt: ctx.now,
    });
    return id;
  }

  protected async runAgentLoop(
    userMessage: string,
    ctx: AgentRunContext,
    decisions: AgentDecision[]
  ): Promise<void> {
    const messages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: userMessage },
    ];

    const tools = this.toolDefinitions as Anthropic.Messages.Tool[];

    for (let iteration = 0; iteration < 10; iteration++) {
      const response = await this.client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 4096,
        system: this.systemPrompt,
        tools,
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "end_turn") break;
      if (response.stop_reason !== "tool_use") break;

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        try {
          const result = await this.handleToolCall(
            block.name,
            block.input as Record<string, unknown>,
            ctx
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        } catch (err) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          });
        }
      }

      if (toolResults.length > 0) {
        messages.push({ role: "user", content: toolResults });
      }
    }

    // Extract final text decisions from last assistant message
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === "assistant" && Array.isArray(lastMsg.content)) {
      for (const block of lastMsg.content) {
        if (block.type === "text" && block.text.trim()) {
          decisions.push({
            action: "agent_summary",
            justification: block.text.trim(),
            requiresApproval: false,
            executed: false,
          });
        }
      }
    }
  }

  protected today(now: number): number {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  protected addDays(ts: number, days: number): number {
    return ts + days * 86_400_000;
  }

  protected daysBetween(a: number, b: number): number {
    return Math.round((b - a) / 86_400_000);
  }

  protected formatBRL(value: number): string {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  }
}
