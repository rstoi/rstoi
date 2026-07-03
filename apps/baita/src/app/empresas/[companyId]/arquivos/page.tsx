import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { PROCESSING_STATUS_LABELS } from "@/lib/labels";
import { processFileAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, "green" | "yellow" | "red" | "gray"> = {
  UPLOADED: "gray",
  PROCESSING: "yellow",
  PROCESSED: "green",
  PROCESSED_WITH_WARNINGS: "yellow",
  FAILED: "red",
  NEEDS_REVIEW: "yellow",
};

export default async function ArquivosPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [files, sources] = await Promise.all([
    prisma.uploadedFile.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, include: { dataSource: true } }),
    prisma.dataSource.findMany({ where: { companyId } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Upload e Arquivos</h1>
      <p className="mt-1 text-sm text-muted">Envie extratos, notas, planilhas e outros documentos para extração.</p>

      <Card title="Novo upload" className="mt-6">
        <form action={`/api/empresas/${companyId}/arquivos`} method="POST" encType="multipart/form-data" className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Arquivos *</label>
            <input type="file" name="files" multiple required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Fonte de dados</label>
            <select name="dataSourceId" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              <option value="">—</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Período início</label>
              <input type="date" name="periodStart" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Período fim</label>
              <input type="date" name="periodEnd" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="md:col-span-2">
            <Button type="submit">Enviar</Button>
          </div>
        </form>
      </Card>

      <Card className="mt-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2">Arquivo</th>
              <th className="pb-2">Fonte</th>
              <th className="pb-2">Enviado em</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Confiança</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {files.map((file) => {
              const processFile = processFileAction.bind(null, companyId, file.id);
              return (
                <tr key={file.id}>
                  <td className="py-2.5 font-medium">{file.originalFileName}</td>
                  <td className="py-2.5 text-muted">{file.dataSource?.name ?? "—"}</td>
                  <td className="py-2.5 text-muted">{formatDateTime(file.createdAt)}</td>
                  <td className="py-2.5">
                    <Badge color={STATUS_COLOR[file.processingStatus]}>{PROCESSING_STATUS_LABELS[file.processingStatus]}</Badge>
                  </td>
                  <td className="py-2.5 text-muted">
                    {file.extractionConfidence !== null ? `${Math.round(file.extractionConfidence * 100)}%` : "—"}
                  </td>
                  <td className="py-2.5 text-right">
                    {file.processingStatus === "UPLOADED" && (
                      <form action={processFile}>
                        <Button type="submit" variant="secondary" className="text-xs">
                          Processar
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {files.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-muted">
                  Nenhum arquivo enviado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
