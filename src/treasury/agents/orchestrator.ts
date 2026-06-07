import { getDb } from "../../store/db.js";
import type { AgentDecision, AgentRunResult } from "../types.js";
import type { AgentRunContext } from "./base.js";
import { BankReconciliationAgent } from "./bank-reconciliation.js";
import { PaymentAgent } from "./payment.js";
import { ReceivablesAgent } from "./receivables.js";
import { AnticipationAgent } from "./anticipation.js";
import { CashFlowAgent } from "./cash-flow.js";

export interface OrchestratorRunOptions {
  dryRun?: boolean;
  agents?: ("reconciliation" | "payment" | "receivables" | "anticipation" | "cashflow")[];
}

export class TreasuryOrchestrator {
  private readonly reconciliationAgent = new BankReconciliationAgent();
  private readonly paymentAgent = new PaymentAgent();
  private readonly receivablesAgent = new ReceivablesAgent();
  private readonly anticipationAgent = new AnticipationAgent();
  private readonly cashFlowAgent = new CashFlowAgent();

  async runDailyRoutine(options: OrchestratorRunOptions = {}): Promise<AgentRunResult[]> {
    const db = getDb();
    const ctx: AgentRunContext = {
      db,
      now: Date.now(),
      dryRun: options.dryRun ?? false,
    };

    const agentsToRun = options.agents ?? ["reconciliation", "cashflow", "anticipation", "payment", "receivables"];
    const results: AgentRunResult[] = [];

    console.error(`[Treasury] Starting daily routine — agents: ${agentsToRun.join(", ")} dryRun=${ctx.dryRun}`);

    // 1. Cash flow first — sets context for other decisions
    if (agentsToRun.includes("cashflow")) {
      results.push(await this.runAgent("cash-flow", () => this.cashFlowAgent.run(ctx)));
    }

    // 2. Reconciliation — keeps ledger clean
    if (agentsToRun.includes("reconciliation")) {
      results.push(await this.runAgent("bank-reconciliation", () => this.reconciliationAgent.run(ctx)));
    }

    // 3. Anticipation — funds the account if needed before paying
    if (agentsToRun.includes("anticipation")) {
      results.push(await this.runAgent("anticipation", () => this.anticipationAgent.run(ctx)));
    }

    // 4. Payments — execute after ensuring cash is available
    if (agentsToRun.includes("payment")) {
      results.push(await this.runAgent("payment", () => this.paymentAgent.run(ctx)));
    }

    // 5. Collections — last, sends messages to customers
    if (agentsToRun.includes("receivables")) {
      results.push(await this.runAgent("receivables", () => this.receivablesAgent.run(ctx)));
    }

    console.error(`[Treasury] Daily routine complete — ${results.reduce((s, r) => s + r.executedCount, 0)} actions executed`);
    return results;
  }

  private async runAgent(name: string, fn: () => Promise<AgentDecision[]>): Promise<AgentRunResult> {
    const start = Date.now();
    console.error(`[Treasury:${name}] Starting...`);
    try {
      const decisions = await fn();
      const result: AgentRunResult = {
        agent: name,
        decisions,
        executedCount: decisions.filter(d => d.executed).length,
        pendingApprovalCount: decisions.filter(d => d.requiresApproval && !d.executed).length,
        runAt: start,
      };
      console.error(`[Treasury:${name}] Done — ${result.executedCount} executed, ${result.pendingApprovalCount} pending approval`);
      return result;
    } catch (err) {
      console.error(`[Treasury:${name}] Error:`, err);
      return {
        agent: name,
        decisions: [{
          action: "agent_error",
          justification: err instanceof Error ? err.message : String(err),
          requiresApproval: false,
          executed: false,
        }],
        executedCount: 0,
        pendingApprovalCount: 0,
        runAt: start,
      };
    }
  }

  getBankReconciliationAgent(): BankReconciliationAgent {
    return this.reconciliationAgent;
  }
}
