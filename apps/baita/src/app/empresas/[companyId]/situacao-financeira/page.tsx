import { prisma } from "@/lib/prisma";
import { TreasuryAgent } from "@/agents/treasury-agent";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge, RatingBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { PAYABLE_STATUS_LABELS, RECEIVABLE_STATUS_LABELS } from "@/lib/labels";
import { LIQUIDITY_RISK_LABELS, TREASURY_SITUATION_LABELS } from "@/lib/treasury-service";
import {
  createReceivableAction,
  createPayableAction,
  createDebtAction,
  createTaxObligationAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function SituacaoFinanceiraPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

  const [treasuryResult, receivables, payables, debts, taxes] = await Promise.all([
    new TreasuryAgent().run({ companyId }),
    prisma.receivable.findMany({ where: { companyId }, orderBy: { dueDate: "asc" }, take: 30 }),
    prisma.payable.findMany({ where: { companyId }, orderBy: { dueDate: "asc" }, take: 30 }),
    prisma.debt.findMany({ where: { companyId }, orderBy: { nextDueDate: "asc" } }),
    prisma.taxObligation.findMany({ where: { companyId }, orderBy: { dueDate: "asc" } }),
  ]);

  const t = treasuryResult.output;
  const createReceivable = createReceivableAction.bind(null, companyId);
  const createPayable = createPayableAction.bind(null, companyId);
  const createDebt = createDebtAction.bind(null, companyId);
  const createTax = createTaxObligationAction.bind(null, companyId);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Situação Financeira</h1>
      <p className="mt-1 text-sm text-muted">
        Classificação atual: <strong>{TREASURY_SITUATION_LABELS[t.situation]}</strong> · Risco de liquidez:{" "}
        <strong>{LIQUIDITY_RISK_LABELS[t.liquidityRisk]}</strong>
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Caixa atual" value={formatCurrency(t.currentCash)} />
        <StatCard label="Caixa livre" value={formatCurrency(t.freeCash)} status={t.freeCash >= 0 ? "good" : "critical"} />
        <StatCard label="Caixa comprometido" value={formatCurrency(t.committedCash)} />
        <StatCard label="Necessidade de capital de giro" value={formatCurrency(t.workingCapitalNeed)} />
        <StatCard label="Recebíveis vencidos" value={formatCurrency(t.receivablesOverdue)} status={t.receivablesOverdue > 0 ? "warning" : "good"} />
        <StatCard label="Recebíveis a vencer" value={formatCurrency(t.receivablesUpcoming)} />
        <StatCard label="Pagáveis vencidos" value={formatCurrency(t.payablesOverdue)} status={t.payablesOverdue > 0 ? "critical" : "good"} />
        <StatCard label="Pagáveis a vencer" value={formatCurrency(t.payablesUpcoming)} />
        <StatCard label="Dívida total" value={formatCurrency(t.totalDebt)} />
        <StatCard label="Serviço da dívida mensal" value={formatCurrency(t.monthlyDebtService)} />
        <StatCard label="Impostos vencidos" value={formatCurrency(t.taxesOverdue)} status={t.taxesOverdue > 0 ? "critical" : "good"} />
        <StatCard label="Impostos a vencer" value={formatCurrency(t.taxesUpcoming)} />
        <StatCard
          label="Runway"
          value={t.runwayMonths !== null ? `${t.runwayMonths.toFixed(1)} meses` : "—"}
          status={t.runwayMonths !== null && t.runwayMonths < 2 ? "critical" : "good"}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Contas a receber">
          <SimpleTable
            rows={receivables}
            columns={[
              { key: "customerName", label: "Cliente" },
              { key: "amount", label: "Valor", render: (r) => formatCurrency(r.amount.toString()) },
              { key: "dueDate", label: "Vencimento", render: (r) => formatDate(r.dueDate) },
              { key: "status", label: "Status", render: (r) => <Badge color="purple">{RECEIVABLE_STATUS_LABELS[r.status]}</Badge> },
              { key: "reliabilityRating", label: "Rating", render: (r) => <RatingBadge rating={r.reliabilityRating} /> },
            ]}
          />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-baita-purple">+ Nova conta a receber</summary>
            <form action={createReceivable} className="mt-3 space-y-2">
              <input name="customerName" placeholder="Cliente *" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <input name="amount" type="number" step="0.01" placeholder="Valor *" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <input name="dueDate" type="date" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <input name="probability" type="number" step="0.05" min="0" max="1" defaultValue="1" placeholder="Probabilidade (0 a 1)" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <RatingSelect />
              <Button type="submit" variant="secondary">Adicionar</Button>
            </form>
          </details>
        </Card>

        <Card title="Contas a pagar">
          <SimpleTable
            rows={payables}
            columns={[
              { key: "supplierName", label: "Fornecedor" },
              { key: "amount", label: "Valor", render: (p) => formatCurrency(p.amount.toString()) },
              { key: "dueDate", label: "Vencimento", render: (p) => formatDate(p.dueDate) },
              { key: "status", label: "Status", render: (p) => <Badge color="purple">{PAYABLE_STATUS_LABELS[p.status]}</Badge> },
              { key: "reliabilityRating", label: "Rating", render: (p) => <RatingBadge rating={p.reliabilityRating} /> },
            ]}
          />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-baita-purple">+ Nova conta a pagar</summary>
            <form action={createPayable} className="mt-3 space-y-2">
              <input name="supplierName" placeholder="Fornecedor *" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <input name="amount" type="number" step="0.01" placeholder="Valor *" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <input name="dueDate" type="date" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="renegotiable" /> Renegociável</label>
              <RatingSelect />
              <Button type="submit" variant="secondary">Adicionar</Button>
            </form>
          </details>
        </Card>

        <Card title="Dívidas">
          <SimpleTable
            rows={debts}
            columns={[
              { key: "creditorName", label: "Credor" },
              { key: "debtType", label: "Tipo" },
              { key: "principalBalance", label: "Saldo devedor", render: (d) => formatCurrency(d.principalBalance.toString()) },
              { key: "installmentAmount", label: "Parcela", render: (d) => (d.installmentAmount ? formatCurrency(d.installmentAmount.toString()) : "—") },
              { key: "nextDueDate", label: "Próximo vencimento", render: (d) => formatDate(d.nextDueDate) },
            ]}
          />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-baita-purple">+ Nova dívida</summary>
            <form action={createDebt} className="mt-3 space-y-2">
              <input name="creditorName" placeholder="Credor *" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <input name="debtType" placeholder="Tipo (capital de giro, financiamento...)" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <input name="principalBalance" type="number" step="0.01" placeholder="Saldo devedor *" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <input name="installmentAmount" type="number" step="0.01" placeholder="Valor da parcela" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <input name="interestRateMonthly" type="number" step="0.001" placeholder="Taxa de juros mensal" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <input name="nextDueDate" type="date" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <RatingSelect />
              <Button type="submit" variant="secondary">Adicionar</Button>
            </form>
          </details>
        </Card>

        <Card title="Impostos">
          <SimpleTable
            rows={taxes}
            columns={[
              { key: "taxType", label: "Tributo" },
              { key: "competence", label: "Competência" },
              { key: "amount", label: "Valor", render: (t2) => formatCurrency(t2.amount.toString()) },
              { key: "dueDate", label: "Vencimento", render: (t2) => formatDate(t2.dueDate) },
            ]}
          />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-baita-purple">+ Novo imposto</summary>
            <form action={createTax} className="mt-3 space-y-2">
              <input name="taxType" placeholder="Tributo (ISS, PIS/COFINS...) *" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <input name="competence" placeholder="Competência (Ex.: 06/2026) *" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <input name="amount" type="number" step="0.01" placeholder="Valor *" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <input name="dueDate" type="date" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
              <RatingSelect />
              <Button type="submit" variant="secondary">Adicionar</Button>
            </form>
          </details>
        </Card>
      </div>
    </div>
  );
}

function RatingSelect() {
  return (
    <select name="reliabilityRating" defaultValue="UNKNOWN" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
      {["A", "B", "C", "D", "E", "UNKNOWN"].map((r) => (
        <option key={r} value={r}>
          Rating {r}
        </option>
      ))}
    </select>
  );
}

function SimpleTable<T extends { id: string }>({
  rows,
  columns,
}: {
  rows: T[];
  columns: { key: string; label: string; render?: (row: T) => React.ReactNode }[];
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
          {columns.map((c) => (
            <th key={c.key} className="pb-2 pr-2">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((row) => (
          <tr key={row.id}>
            {columns.map((c) => (
              <td key={c.key} className="py-2 pr-2">
                {c.render ? c.render(row) : String((row as never)[c.key] ?? "—")}
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="py-3 text-center text-muted">
              Nenhum registro.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
