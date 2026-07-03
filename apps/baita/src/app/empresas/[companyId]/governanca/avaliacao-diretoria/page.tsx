import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DIMENSION_CRITERIA, DIMENSION_LABELS } from "@/lib/director-evaluation-service";
import { submitDirectorEvaluationAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AvaliacaoDiretoriaPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const submit = submitDirectorEvaluationAction.bind(null, companyId);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Avaliação de Maturidade da Diretoria</h1>
      <p className="mt-1 text-sm text-muted">
        Pontue cada critério de 1 (inicial) a 5 (maduro). Critérios não pontuados não entram na média da dimensão.
      </p>

      <form action={submit} className="mt-6 space-y-6">
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Início do período *</label>
              <input type="date" name="periodStart" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Fim do período *</label>
              <input type="date" name="periodEnd" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
            </div>
          </div>
        </Card>

        {Object.entries(DIMENSION_CRITERIA).map(([dimension, criteria]) => (
          <Card key={dimension} title={DIMENSION_LABELS[dimension as keyof typeof DIMENSION_LABELS]}>
            <div className="space-y-3">
              {criteria.map((criterion) => (
                <div key={criterion} className="flex items-center justify-between gap-4">
                  <label className="text-sm">{criterion}</label>
                  <select
                    name={`${dimension}::${criterion}`}
                    defaultValue=""
                    className="rounded-md border border-border bg-transparent px-3 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </Card>
        ))}

        <Card title="Notas gerais">
          <textarea name="notes" rows={3} className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
        </Card>

        <Button type="submit">Salvar avaliação</Button>
      </form>
    </div>
  );
}
