import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DATA_SOURCE_TYPE_LABELS } from "@/lib/labels";
import { CollectorAgent, MINIMUM_CHECKLIST } from "@/agents/collector-agent";
import { createDataSourceAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function FontesPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [sources, people, collectorResult] = await Promise.all([
    prisma.dataSource.findMany({ where: { companyId }, orderBy: { createdAt: "asc" }, include: { ownerPerson: true } }),
    prisma.person.findMany({ where: { companyId, active: true } }),
    new CollectorAgent().run({ companyId }),
  ]);

  const createSource = createDataSourceAction.bind(null, companyId);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Fontes de Dados</h1>
      <p className="mt-1 text-sm text-muted">Mapa de fontes disponíveis e pendências frente ao checklist mínimo.</p>

      {collectorResult.output.missingRecommended.length > 0 && (
        <Card className="mt-6 border-status-warning/40">
          <p className="mb-2 text-sm font-medium text-status-warning">Fontes recomendadas ainda ausentes</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted">
            {collectorResult.output.missingRecommended.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2">Nome</th>
              <th className="pb-2">Tipo</th>
              <th className="pb-2">Responsável</th>
              <th className="pb-2">Acesso</th>
              <th className="pb-2">Confiança inicial</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sources.map((source) => (
              <tr key={source.id}>
                <td className="py-2.5 font-medium">{source.name}</td>
                <td className="py-2.5 text-muted">{DATA_SOURCE_TYPE_LABELS[source.type]}</td>
                <td className="py-2.5 text-muted">{source.ownerPerson?.name ?? "—"}</td>
                <td className="py-2.5">
                  <Badge color={source.accessStatus === "GRANTED" ? "green" : "yellow"}>{source.accessStatus}</Badge>
                </td>
                <td className="py-2.5">
                  <Badge color="purple">{source.confidenceInitial}</Badge>
                </td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-muted">
                  Nenhuma fonte cadastrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Nova fonte de dados" className="mt-6">
        <form action={createSource} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Nome *</label>
            <input name="name" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Tipo</label>
            <select name="type" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              {Object.entries(DATA_SOURCE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
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
          <div>
            <label className="mb-1 block text-sm font-medium">Confiança inicial estimada</label>
            <select name="confidenceInitial" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              {["A", "B", "C", "D", "E", "UNKNOWN"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Descrição</label>
            <textarea name="description" rows={2} className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-2">
            <Button type="submit">Cadastrar fonte</Button>
          </div>
        </form>
      </Card>

      <p className="mt-4 text-xs text-muted">
        Checklist mínimo recomendado: {MINIMUM_CHECKLIST.map((i) => i.label).join(" · ")}
      </p>
    </div>
  );
}
