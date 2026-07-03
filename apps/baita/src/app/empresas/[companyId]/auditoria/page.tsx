import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const logs = await prisma.auditLog.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actorUser: true },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
      <p className="mt-1 text-sm text-muted">
        Trilha completa de alterações — nenhum dado bruto é excluído sem registro correspondente.
      </p>

      <Card className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 pr-2">Data</th>
              <th className="pb-2 pr-2">Ação</th>
              <th className="pb-2 pr-2">Entidade</th>
              <th className="pb-2 pr-2">Origem</th>
              <th className="pb-2">Racional</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="py-2 pr-2 whitespace-nowrap text-muted">{formatDateTime(log.createdAt)}</td>
                <td className="py-2 pr-2">
                  <Badge color="purple">{log.action}</Badge>
                </td>
                <td className="py-2 pr-2">
                  {log.entityType}
                  {log.entityId && <span className="text-muted"> · {log.entityId.slice(0, 8)}</span>}
                </td>
                <td className="py-2 pr-2 text-muted">{log.agentName ?? log.actorUser?.name ?? "Sistema"}</td>
                <td className="py-2 text-muted">{log.rationale ?? "—"}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-muted">
                  Nenhum registro de auditoria ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
