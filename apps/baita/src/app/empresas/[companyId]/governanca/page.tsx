import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { GovernanceAgent } from "@/agents/governance-agent";
import { DIMENSION_LABELS } from "@/lib/director-evaluation-service";
import { createRitualAction, createMeetingAction } from "./actions";

export const dynamic = "force-dynamic";

const RITUAL_TYPE_LABELS: Record<string, string> = {
  TREASURY_WEEKLY: "Tesouraria semanal",
  MONTHLY_CLOSING: "Fechamento mensal",
  QUARTERLY_STRATEGIC: "Revisão estratégica trimestral",
  BOARD_MEETING: "Reunião de diretoria",
  COMMITTEE: "Comitê",
  OTHER: "Outro",
};

const DIMENSION_SCORE_FIELD: Record<string, string> = {
  STRATEGIC_LEADERSHIP: "strategicLeadershipScore",
  EXECUTION_DISCIPLINE: "executionDisciplineScore",
  GOVERNANCE_ROLES: "governanceScore",
  FINANCIAL_MANAGEMENT: "financialManagementScore",
  COOPERATION_MATURITY: "cooperationScore",
  COMMERCIAL_GROWTH: "commercialGrowthScore",
  SYSTEMS_PROCESSES: "systemsProcessesScore",
  LEARNING_DEVELOPMENT: "learningDevelopmentScore",
};

export default async function GovernancaPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

  const [governanceResult, rituals, meetings, people, lastEvaluation] = await Promise.all([
    new GovernanceAgent().run({ companyId }),
    prisma.governanceRitual.findMany({ where: { companyId, active: true } }),
    prisma.meetingRecord.findMany({ where: { companyId }, orderBy: { date: "desc" }, take: 8, include: { ritual: true } }),
    prisma.person.findMany({ where: { companyId, active: true } }),
    prisma.directorEvaluation.findFirst({ where: { companyId }, orderBy: { periodEnd: "desc" } }),
  ]);

  const createRitual = createRitualAction.bind(null, companyId);
  const createMeeting = createMeetingAction.bind(null, companyId);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Governança e Diretoria</h1>
      <p className="mt-1 text-sm text-muted">Rituais, atas, decisões e avaliação de maturidade da diretoria.</p>

      <Card title="Avaliação de maturidade da diretoria" className="mt-6">
        {lastEvaluation ? (
          <div>
            <p className="text-sm">
              Score geral mais recente ({formatDate(lastEvaluation.periodStart)} a {formatDate(lastEvaluation.periodEnd)}):{" "}
              <strong>{lastEvaluation.totalScore.toFixed(1)} / 5</strong>
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              {Object.entries(DIMENSION_LABELS).map(([key, label]) => {
                const field = DIMENSION_SCORE_FIELD[key];
                return (
                  <div key={key} className="baita-card p-2">
                    <p className="text-muted">{label}</p>
                    <p className="font-semibold">{(lastEvaluation as never as Record<string, number>)[field]?.toFixed?.(1) ?? "—"}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Nenhuma avaliação de diretoria registrada ainda.</p>
        )}
        <Link href={`/empresas/${companyId}/governanca/avaliacao-diretoria`} className="mt-3 inline-block text-sm font-medium text-baita-purple hover:underline">
          Nova avaliação de diretoria →
        </Link>
      </Card>

      <Card title="Saúde dos rituais" className="mt-6">
        <p className="text-sm text-muted">{governanceResult.output.ritualsHealthy} ritual(is) em dia.</p>
        {governanceResult.output.ritualsOverdue.length > 0 && (
          <ul className="mt-2 list-inside list-disc text-sm text-status-warning">
            {governanceResult.output.ritualsOverdue.map((r) => (
              <li key={r.ritualName}>
                {r.ritualName} ({r.frequency}) — última reunião: {r.lastMeeting ?? "nunca"}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="Rituais de governança">
          <ul className="mb-4 divide-y divide-border text-sm">
            {rituals.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <span>{r.name}</span>
                <Badge color="purple">{RITUAL_TYPE_LABELS[r.type]}</Badge>
              </li>
            ))}
            {rituals.length === 0 && <p className="py-2 text-muted">Nenhum ritual cadastrado.</p>}
          </ul>
          <form action={createRitual} className="space-y-2">
            <input name="name" placeholder="Nome do ritual *" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
            <select name="type" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              {Object.entries(RITUAL_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select name="frequency" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              <option value="WEEKLY">Semanal</option>
              <option value="BIWEEKLY">Quinzenal</option>
              <option value="MONTHLY">Mensal</option>
              <option value="QUARTERLY">Trimestral</option>
            </select>
            <select name="ownerPersonId" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              <option value="">Responsável —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary">Cadastrar ritual</Button>
          </form>
        </Card>

        <Card title="Atas recentes">
          <ul className="mb-4 divide-y divide-border text-sm">
            {meetings.map((m) => (
              <li key={m.id} className="py-2">
                <p className="font-medium">{m.title}</p>
                <p className="text-xs text-muted">{formatDate(m.date)} · {m.ritual?.name ?? "Sem ritual vinculado"}</p>
              </li>
            ))}
            {meetings.length === 0 && <p className="py-2 text-muted">Nenhuma ata registrada.</p>}
          </ul>
          <form action={createMeeting} className="space-y-2">
            <input name="title" placeholder="Título da reunião *" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
            <select name="ritualId" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              <option value="">Ritual —</option>
              {rituals.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <input name="date" type="date" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
            <textarea name="agenda" placeholder="Pauta" rows={2} className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
            <textarea name="notes" placeholder="Notas / decisões" rows={2} className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
            <Button type="submit" variant="secondary">Registrar ata</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
