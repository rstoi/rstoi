/**
 * GovernanceAgent — acompanha rituais de governança (pautas, atas, OKRs,
 * papéis e alçadas), identificando rituais ativos sem reunião recente.
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { prisma } from "@/lib/prisma";

export type GovernanceInput = { companyId: string };
export type GovernanceOutput = {
  ritualsHealthy: number;
  ritualsOverdue: { ritualName: string; frequency: string; lastMeeting: string | null }[];
};

const FREQUENCY_DAYS: Record<string, number> = {
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 31,
  QUARTERLY: 93,
};

export class GovernanceAgent extends BaseAgent<GovernanceInput, GovernanceOutput> {
  readonly name = "GovernanceAgent";
  readonly version = "1.0.0";
  readonly description = "Acompanha rituais, pautas, atas e cumprimento de governança.";

  protected async execute(input: GovernanceInput): Promise<AgentRunResult<GovernanceOutput>> {
    const rituals = await prisma.governanceRitual.findMany({
      where: { companyId: input.companyId, active: true },
      include: { meetingRecords: { orderBy: { date: "desc" }, take: 1 } },
    });

    const ritualsOverdue: GovernanceOutput["ritualsOverdue"] = [];
    let ritualsHealthy = 0;

    for (const ritual of rituals) {
      const expectedDays = FREQUENCY_DAYS[ritual.frequency.toUpperCase()] ?? 31;
      const lastMeeting = ritual.meetingRecords[0]?.date ?? null;
      const daysSinceLastMeeting = lastMeeting
        ? (Date.now() - lastMeeting.getTime()) / (1000 * 60 * 60 * 24)
        : Infinity;

      if (daysSinceLastMeeting > expectedDays * 1.5) {
        ritualsOverdue.push({
          ritualName: ritual.name,
          frequency: ritual.frequency,
          lastMeeting: lastMeeting ? lastMeeting.toISOString().slice(0, 10) : null,
        });
      } else {
        ritualsHealthy++;
      }
    }

    const confidence = rituals.length > 0 ? ritualsHealthy / rituals.length : 0.3;

    return {
      output: { ritualsHealthy, ritualsOverdue },
      confidence,
      warnings: ritualsOverdue.map((r) => ({
        code: "RITUAL_OVERDUE",
        message: `Ritual "${r.ritualName}" (${r.frequency}) sem reunião recente.`,
      })),
      errors: [],
      ruleBasedMode: true,
    };
  }
}
