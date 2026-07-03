import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge, RatingBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { DATA_SOURCE_TYPE_LABELS } from "@/lib/labels";
import {
  setEventCategoryAction,
  markAsTransferAction,
  markAsDuplicateAction,
  adjustRatingAction,
  sendForReviewAction,
  createReceivableFromEventAction,
  createPayableFromEventAction,
  runDeduplicatorAction,
  runClassifierAction,
  runQualityAuditorAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function BaseFinanceiraPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ needsReview?: string }>;
}) {
  const { companyId } = await params;
  const { needsReview } = await searchParams;

  const [events, categories] = await Promise.all([
    prisma.financialEvent.findMany({
      where: { companyId, ...(needsReview === "1" ? { needsReview: true } : {}) },
      orderBy: { financialDate: "desc" },
      take: 100,
      include: { managementCategory: true },
    }),
    prisma.managementCategory.findMany({ where: { companyId, isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const runDedup = runDeduplicatorAction.bind(null, companyId);
  const runClassifier = runClassifierAction.bind(null, companyId);
  const runQuality = runQualityAuditorAction.bind(null, companyId);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Base Financeira Canônica</h1>
          <p className="mt-1 text-sm text-muted">Eventos financeiros normalizados, classificados e com rating de confiabilidade.</p>
        </div>
        <div className="flex gap-2">
          <form action={runDedup}>
            <Button type="submit" variant="secondary">Rodar deduplicação</Button>
          </form>
          <form action={runClassifier}>
            <Button type="submit" variant="secondary">Rodar classificação</Button>
          </form>
          <form action={runQuality}>
            <Button type="submit" variant="secondary">Rodar auditoria de qualidade</Button>
          </form>
        </div>
      </div>

      <div className="mb-4 flex gap-2 text-sm">
        <a href="?" className={`rounded-md px-3 py-1 ${!needsReview ? "bg-baita-purple text-white" : "border border-border"}`}>
          Todos
        </a>
        <a href="?needsReview=1" className={`rounded-md px-3 py-1 ${needsReview === "1" ? "bg-baita-purple text-white" : "border border-border"}`}>
          Precisam de revisão
        </a>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 pr-2">Data</th>
              <th className="pb-2 pr-2">Valor</th>
              <th className="pb-2 pr-2">Contraparte</th>
              <th className="pb-2 pr-2">Fonte</th>
              <th className="pb-2 pr-2">Categoria</th>
              <th className="pb-2 pr-2">Rating</th>
              <th className="pb-2 pr-2">Status</th>
              <th className="pb-2">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((event) => {
              const setCategory = setEventCategoryAction.bind(null, companyId, event.id);
              const markTransfer = markAsTransferAction.bind(null, companyId, event.id);
              const markDuplicate = markAsDuplicateAction.bind(null, companyId, event.id);
              const adjustRating = adjustRatingAction.bind(null, companyId, event.id);
              const sendReview = sendForReviewAction.bind(null, companyId, event.id);
              const createReceivable = createReceivableFromEventAction.bind(null, companyId, event.id);
              const createPayable = createPayableFromEventAction.bind(null, companyId, event.id);

              return (
                <tr key={event.id} className={event.isDuplicate ? "opacity-40" : ""}>
                  <td className="py-2 pr-2 whitespace-nowrap">{formatDate(event.financialDate)}</td>
                  <td className="py-2 pr-2 whitespace-nowrap tabular-nums">{formatCurrency(event.netAmount.toString())}</td>
                  <td className="py-2 pr-2 max-w-[160px] truncate" title={event.counterpartyName ?? ""}>
                    {event.counterpartyName ?? "—"}
                  </td>
                  <td className="py-2 pr-2 text-muted">{DATA_SOURCE_TYPE_LABELS[event.sourceType]}</td>
                  <td className="py-2 pr-2">
                    <form action={setCategory} className="flex items-center gap-1">
                      <select
                        name="managementCategoryId"
                        defaultValue={event.managementCategoryId ?? ""}
                        className="rounded border border-border bg-transparent px-1 py-0.5 text-xs"
                      >
                        <option value="">Sem categoria</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-xs text-baita-purple hover:underline">
                        ✓
                      </button>
                    </form>
                  </td>
                  <td className="py-2 pr-2">
                    <form action={adjustRating} className="flex items-center gap-1">
                      <select name="reliabilityRating" defaultValue={event.reliabilityRating} className="rounded border border-border bg-transparent px-1 py-0.5 text-xs">
                        {["A", "B", "C", "D", "E", "UNKNOWN"].map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-xs text-baita-purple hover:underline">
                        ✓
                      </button>
                    </form>
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex flex-col gap-1">
                      {event.needsReview && <Badge color="yellow">Revisar</Badge>}
                      {event.isDuplicate && <Badge color="red">Duplicado</Badge>}
                      {event.isTransfer && <Badge color="gray">Transferência</Badge>}
                      {!event.needsReview && !event.isDuplicate && !event.isTransfer && <RatingBadge rating={event.reliabilityRating} />}
                    </div>
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <form action={markTransfer}>
                        <button className="text-muted hover:text-baita-purple">Transferência</button>
                      </form>
                      <form action={markDuplicate}>
                        <button className="text-muted hover:text-status-critical">Duplicado</button>
                      </form>
                      <form action={sendReview}>
                        <button className="text-muted hover:text-status-warning">Revisar</button>
                      </form>
                      <form action={createReceivable}>
                        <button className="text-muted hover:text-baita-purple">+Receber</button>
                      </form>
                      <form action={createPayable}>
                        <button className="text-muted hover:text-baita-purple">+Pagar</button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {events.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted">
                  Nenhum evento financeiro encontrado. Envie e processe arquivos em &quot;Arquivos&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
