import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { PDCA_STATUS_LABELS } from "@/lib/labels";
import { createImprovementCycleAction, updatePdcaStageAction, updateImprovementStatusAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PdcaPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [pdcaRecords, improvementActions] = await Promise.all([
    prisma.pDCARecord.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, include: { ownerPerson: true } }),
    prisma.improvementAction.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, include: { ownerPerson: true } }),
  ]);

  const createCycle = createImprovementCycleAction.bind(null, companyId);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">PDCA e Melhoria Contínua</h1>
      <p className="mt-1 text-sm text-muted">Ciclos Plan-Do-Check-Act e ações corretivas/preventivas geradas a partir de desvios.</p>

      <Card title="Novo ciclo a partir de um problema" className="mt-6">
        <form action={createCycle} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Problema identificado *</label>
            <textarea name="problem" required rows={2} className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Hipótese de causa raiz</label>
            <input name="rootCauseHint" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Prazo</label>
            <input name="dueDate" type="date" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-2">
            <Button type="submit">Criar ciclo PDCA</Button>
          </div>
        </form>
      </Card>

      <Card title="Ciclos PDCA" className="mt-6">
        <ul className="divide-y divide-border">
          {pdcaRecords.map((record) => {
            const updateStage = updatePdcaStageAction.bind(null, companyId, record.id);
            return (
              <li key={record.id} className="py-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-medium">{record.cycleName}</p>
                  <Badge color="purple">{PDCA_STATUS_LABELS[record.status]}</Badge>
                </div>
                <p className="text-sm text-muted"><strong>Plan:</strong> {record.planText}</p>
                {record.doText && <p className="text-sm text-muted"><strong>Do:</strong> {record.doText}</p>}
                {record.checkText && <p className="text-sm text-muted"><strong>Check:</strong> {record.checkText}</p>}
                {record.actText && <p className="text-sm text-muted"><strong>Act:</strong> {record.actText}</p>}
                <form action={updateStage} className="mt-2 flex flex-wrap items-end gap-2">
                  <select name="field" className="rounded-md border border-border bg-transparent px-2 py-1 text-xs">
                    <option value="doText">Do</option>
                    <option value="checkText">Check</option>
                    <option value="actText">Act</option>
                  </select>
                  <input name="text" placeholder="Descrever etapa..." className="flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-xs" />
                  <select name="status" className="rounded-md border border-border bg-transparent px-2 py-1 text-xs">
                    {Object.entries(PDCA_STATUS_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" variant="secondary" className="text-xs">
                    Atualizar
                  </Button>
                </form>
              </li>
            );
          })}
          {pdcaRecords.length === 0 && <p className="py-4 text-center text-muted">Nenhum ciclo PDCA criado.</p>}
        </ul>
      </Card>

      <Card title="Ações corretivas e preventivas" className="mt-6">
        <ul className="divide-y divide-border">
          {improvementActions.map((action) => {
            const markInProgress = updateImprovementStatusAction.bind(null, companyId, action.id, "IN_PROGRESS");
            const markDone = updateImprovementStatusAction.bind(null, companyId, action.id, "DONE");
            const markVerified = updateImprovementStatusAction.bind(null, companyId, action.id, "VERIFIED");
            return (
              <li key={action.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{action.problem}</p>
                  {action.rootCause && <p className="text-xs text-muted">Causa raiz: {action.rootCause}</p>}
                  {action.dueDate && <p className="text-xs text-muted">Prazo: {formatDate(action.dueDate)}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={action.status === "VERIFIED" ? "green" : action.status === "DONE" ? "purple" : "yellow"}>
                    {action.status}
                  </Badge>
                  {action.status === "OPEN" && (
                    <form action={markInProgress}>
                      <button className="text-xs text-baita-purple hover:underline">Iniciar</button>
                    </form>
                  )}
                  {action.status === "IN_PROGRESS" && (
                    <form action={markDone}>
                      <button className="text-xs text-status-good hover:underline">Concluir</button>
                    </form>
                  )}
                  {action.status === "DONE" && (
                    <form action={markVerified}>
                      <button className="text-xs text-status-good hover:underline">Verificar</button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
          {improvementActions.length === 0 && <p className="py-4 text-center text-muted">Nenhuma ação registrada.</p>}
        </ul>
      </Card>
    </div>
  );
}
