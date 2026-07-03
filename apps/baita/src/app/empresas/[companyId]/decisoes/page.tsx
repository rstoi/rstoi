import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge, RatingBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { DECISION_STATUS_LABELS, FORECAST_SCENARIO_LABELS } from "@/lib/labels";
import { createDecisionAction, updateDecisionStatusAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DecisoesPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [decisions, recommendations] = await Promise.all([
    prisma.decision.findMany({ where: { companyId }, orderBy: { decisionDate: "desc" }, include: { decidedByUser: true } }),
    prisma.recommendation.findMany({ where: { companyId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
  ]);

  const createDecision = createDecisionAction.bind(null, companyId);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Decisões e Plano de Ação</h1>
      <p className="mt-1 text-sm text-muted">
        Pagamentos críticos, crédito e investimentos relevantes exigem rating A ou B; cortes estruturais exigem rating B com
        revisão humana; hipóteses comerciais podem usar C/D fora do cenário conservador.
      </p>

      <Card className="mt-6">
        <ul className="divide-y divide-border">
          {decisions.map((d) => {
            const markExecuted = updateDecisionStatusAction.bind(null, companyId, d.id, "EXECUTED");
            const markCancelled = updateDecisionStatusAction.bind(null, companyId, d.id, "CANCELLED");
            return (
              <li key={d.id} className="py-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{d.title}</p>
                    <p className="mt-0.5 text-sm text-muted">{d.decisionText}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <RatingBadge rating={d.informationRating} />
                      {d.scenarioConsidered && <Badge color="purple">{FORECAST_SCENARIO_LABELS[d.scenarioConsidered]}</Badge>}
                      {d.responsiblePerson && <Badge>Responsável: {d.responsiblePerson}</Badge>}
                      {d.deadline && <Badge>Prazo: {formatDate(d.deadline)}</Badge>}
                      <Badge>Decidido por: {d.decidedByUser?.name ?? "—"}</Badge>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge color={d.status === "EXECUTED" ? "green" : d.status === "CANCELLED" ? "gray" : "yellow"}>
                      {DECISION_STATUS_LABELS[d.status]}
                    </Badge>
                    {d.status === "PLANNED" && (
                      <div className="flex gap-1 text-xs">
                        <form action={markExecuted}>
                          <button className="text-status-good hover:underline">Executada</button>
                        </form>
                        <form action={markCancelled}>
                          <button className="text-muted hover:underline">Cancelar</button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {decisions.length === 0 && <p className="py-4 text-center text-muted">Nenhuma decisão registrada.</p>}
        </ul>
      </Card>

      <Card title="Nova decisão" className="mt-6">
        <form action={createDecision} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Título *</label>
            <input name="title" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Texto da decisão *</label>
            <textarea name="decisionText" required rows={3} className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Recomendação relacionada</label>
            <select name="recommendationId" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              <option value="">—</option>
              {recommendations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Cenário considerado</label>
            <select name="scenarioConsidered" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              <option value="">—</option>
              {Object.entries(FORECAST_SCENARIO_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Rating da informação usada</label>
            <select name="informationRating" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              {["A", "B", "C", "D", "E", "UNKNOWN"].map((r) => (
                <option key={r} value={r}>
                  Rating {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Responsável pela execução</label>
            <input name="responsiblePerson" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Impacto esperado</label>
            <input name="expectedImpact" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Prazo</label>
            <input name="deadline" type="date" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-2">
            <Button type="submit">Registrar decisão</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
