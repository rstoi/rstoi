import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createManagementCategoryAction, deactivateManagementCategoryAction } from "./actions";

export const dynamic = "force-dynamic";

const DRE_LINE_LABELS: Record<string, string> = {
  GROSS_REVENUE: "Receita bruta",
  SALES_DEDUCTIONS: "Deduções e impostos sobre vendas",
  NET_REVENUE: "Receita líquida",
  VARIABLE_COSTS: "Custos variáveis",
  CONTRIBUTION_MARGIN: "Margem de contribuição",
  FIXED_EXPENSES: "Despesas fixas",
  EBITDA: "EBITDA",
  FINANCIAL_EXPENSES: "Despesas financeiras",
  NON_RECURRING: "Item não recorrente",
  MANAGEMENT_RESULT: "Resultado gerencial",
  NOT_APPLICABLE: "Não entra no DRE (dívida/investimento/transferência)",
};

export default async function ConfiguracoesPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [categories, userAccess] = await Promise.all([
    prisma.managementCategory.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.companyUserAccess.findMany({ where: { companyId }, include: { user: true } }),
  ]);

  const createCategory = createManagementCategoryAction.bind(null, companyId);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
      <p className="mt-1 text-sm text-muted">Plano de contas gerencial e controle de acesso.</p>

      <Card title="Plano de contas gerencial" className="mt-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2">Categoria</th>
              <th className="pb-2">Linha do DRE</th>
              <th className="pb-2">Palavras-chave</th>
              <th className="pb-2">Status</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {categories.map((c) => {
              const deactivate = deactivateManagementCategoryAction.bind(null, companyId, c.id);
              return (
                <tr key={c.id}>
                  <td className="py-2 font-medium">{c.name}</td>
                  <td className="py-2 text-muted">{DRE_LINE_LABELS[c.dreLine]}</td>
                  <td className="py-2 text-muted">{c.ruleHints ?? "—"}</td>
                  <td className="py-2">
                    <Badge color={c.isActive ? "green" : "gray"}>{c.isActive ? "Ativa" : "Inativa"}</Badge>
                  </td>
                  <td className="py-2 text-right">
                    {c.isActive && (
                      <form action={deactivate}>
                        <button className="text-xs text-muted hover:text-status-critical">Desativar</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {categories.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-muted">
                  Nenhuma categoria cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <form action={createCategory} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Nome *</label>
            <input name="name" required className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Linha do DRE</label>
            <select name="dreLine" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              {Object.entries(DRE_LINE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Palavras-chave para classificação automática (separadas por vírgula)</label>
            <input name="ruleHints" placeholder="Ex.: FOLHA, SALARIO, PRO-LABORE" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-2">
            <Button type="submit">Cadastrar categoria</Button>
          </div>
        </form>
      </Card>

      <Card title="Usuários com acesso a esta empresa" className="mt-6">
        <ul className="divide-y divide-border text-sm">
          {userAccess.map((access) => (
            <li key={access.id} className="flex items-center justify-between py-2">
              <span>{access.user.name} ({access.user.email})</span>
              <Badge color="purple">{access.role}</Badge>
            </li>
          ))}
          {userAccess.length === 0 && <p className="py-2 text-muted">Nenhum usuário vinculado explicitamente (papéis globais têm acesso irrestrito).</p>}
        </ul>
      </Card>
    </div>
  );
}
