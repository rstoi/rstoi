import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge, RatingBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { CRITICALITY_LABELS, RECOMMENDATION_AREA_LABELS, RECOMMENDATION_STATUS_LABELS } from "@/lib/labels";
import { createRecommendationAction, updateRecommendationStatusAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, "green" | "yellow" | "red" | "gray" | "purple"> = {
  OPEN: "yellow",
  IN_PROGRESS: "purple",
  DONE: "green",
  DISCARDED: "gray",
};

export default async function RecomendacoesPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [recommendations, people] = await Promise.all([
    prisma.recommendation.findMany({
      where: { companyId },
      orderBy: [{ status: "asc" }, { urgency: "desc" }],
      include: { ownerPerson: true },
    }),
    prisma.person.findMany({ where: { companyId, active: true } }),
  ]);

  const createRecommendation = createRecommendationAction.bind(null, companyId);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Recomendações</h1>
      <p className="mt-1 text-sm text-muted">Toda recomendação deve ter evidência, confiança, responsável e prazo.</p>

      <Card className="mt-6">
        <ul className="divide-y divide-border">
          {recommendations.map((rec) => {
            const markInProgress = updateRecommendationStatusAction.bind(null, companyId, rec.id, "IN_PROGRESS");
            const markDone = updateRecommendationStatusAction.bind(null, companyId, rec.id, "DONE");
            const markDiscarded = updateRecommendationStatusAction.bind(null, companyId, rec.id, "DISCARDED");
            return (
              <li key={rec.id} className="py-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{rec.title}</p>
                    <p className="mt-0.5 text-sm text-muted">{rec.description}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <Badge color="purple">{RECOMMENDATION_AREA_LABELS[rec.area]}</Badge>
                      <Badge color={rec.urgency === "CRITICAL" || rec.urgency === "HIGH" ? "red" : "yellow"}>
                        Urgência {CRITICALITY_LABELS[rec.urgency]}
                      </Badge>
                      <Badge color={rec.impact === "CRITICAL" || rec.impact === "HIGH" ? "red" : "yellow"}>
                        Impacto {CRITICALITY_LABELS[rec.impact]}
                      </Badge>
                      <RatingBadge rating={rec.confidence} />
                      {rec.expectedFinancialImpact && <Badge>{formatCurrency(rec.expectedFinancialImpact.toString())}</Badge>}
                      {rec.deadline && <Badge>Prazo: {formatDate(rec.deadline)}</Badge>}
                      {rec.ownerPerson && <Badge>Responsável: {rec.ownerPerson.name}</Badge>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge color={STATUS_COLOR[rec.status]}>{RECOMMENDATION_STATUS_LABELS[rec.status]}</Badge>
                    {rec.status !== "DONE" && rec.status !== "DISCARDED" && (
                      <div className="flex gap-1 text-xs">
                        {rec.status === "OPEN" && (
                          <form action={markInProgress}>
                            <button className="text-baita-purple hover:underline">Iniciar</button>
                          </form>
                        )}
                        <form action={markDone}>
                          <button className="text-status-good hover:underline">Concluir</button>
                        </form>
                        <form action={markDiscarded}>
                          <button className="text-muted hover:underline">Descartar</button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {recommendations.length === 0 && <p className="py-4 text-center text-muted">Nenhuma recomendação registrada.</p>}
        </ul>
      </Card>

      <Card title="Nova recomendação" className="mt-6">
        <form action={createRecommendation} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Título *</label>
            <input name="title" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Descrição (o que, por que importa, evidência)</label>
            <textarea name="description" rows={3} className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <SelectField name="area" label="Área" options={RECOMMENDATION_AREA_LABELS} />
          <SelectField name="urgency" label="Urgência" options={CRITICALITY_LABELS} />
          <SelectField name="impact" label="Impacto" options={CRITICALITY_LABELS} />
          <div>
            <label className="mb-1 block text-sm font-medium">Confiança da evidência</label>
            <select name="confidence" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              {["A", "B", "C", "D", "E", "UNKNOWN"].map((r) => (
                <option key={r} value={r}>
                  Rating {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Impacto financeiro esperado</label>
            <input name="expectedFinancialImpact" type="number" step="0.01" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Prazo</label>
            <input name="deadline" type="date" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Responsável</label>
            <select name="ownerPersonId" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              <option value="">—</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <Button type="submit">Registrar recomendação</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function SelectField({ name, label, options }: { name: string; label: string; options: Record<string, string> }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <select name={name} className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
        {Object.entries(options).map(([value, opLabel]) => (
          <option key={value} value={value}>
            {opLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
