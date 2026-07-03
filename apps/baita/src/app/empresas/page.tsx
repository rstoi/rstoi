import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ADIZES_STAGE_LABELS } from "@/lib/labels";
import { createCompanyAction } from "@/app/empresas/actions";

export const dynamic = "force-dynamic";

const GLOBAL_ROLES = ["ADMIN", "CONSULTANT", "AUDITOR"];

export default async function EmpresasPage() {
  const user = await requireUser();

  const companies = await prisma.company.findMany({
    where: GLOBAL_ROLES.includes(user.role) ? undefined : { userAccess: { some: { userId: user.id } } },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { people: true, dataSources: true, financialEvents: true } } },
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
          <p className="mt-1 text-sm text-muted">
            Diagnóstico financeiro contínuo — selecione uma empresa ou cadastre uma nova.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {companies.map((company) => (
          <Link key={company.id} href={`/empresas/${company.id}`}>
            <Card className="h-full transition-colors hover:border-baita-purple">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{company.name}</h2>
                  <p className="text-sm text-muted">{company.industry ?? "Setor não informado"}</p>
                </div>
                <span className="rounded-full bg-baita-purple/10 px-2 py-0.5 text-xs font-medium text-baita-purple">
                  {ADIZES_STAGE_LABELS[company.lifecycleStageAdizes]}
                </span>
              </div>
              <div className="mt-4 flex gap-4 text-xs text-muted">
                <span>{company._count.people} pessoas</span>
                <span>{company._count.dataSources} fontes</span>
                <span>{company._count.financialEvents} eventos</span>
              </div>
            </Card>
          </Link>
        ))}
        {companies.length === 0 && (
          <p className="text-sm text-muted">Nenhuma empresa cadastrada ainda. Use o formulário ao lado para começar.</p>
        )}
      </div>

      <Card title="Nova empresa" className="mt-10">
        <form action={createCompanyAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field name="name" label="Nome da empresa *" required />
          <Field name="legalName" label="Razão social" />
          <Field name="cnpj" label="CNPJ" />
          <Field name="industry" label="Setor" />
          <Field name="revenueRange" label="Receita anual estimada" placeholder="Ex.: R$ 2M a R$ 5M" />
          <Field name="employeeRange" label="Número de funcionários" placeholder="Ex.: 20 a 50" />
          <Field name="perceivedStage" label="Estágio percebido" placeholder="Ex.: crescimento acelerado" />
          <Field name="banksUsed" label="Bancos usados" />
          <Field name="existingSystems" label="Sistemas existentes" className="md:col-span-2" />
          <Field name="mainPains" label="Principais dores" textarea className="md:col-span-2" />
          <div className="md:col-span-2">
            <Button type="submit">Cadastrar empresa e iniciar Ciclo 0</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Field({
  name,
  label,
  required,
  placeholder,
  textarea,
  className = "",
}: {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  textarea?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {textarea ? (
        <textarea
          name={name}
          required={required}
          placeholder={placeholder}
          rows={3}
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-baita-purple"
        />
      ) : (
        <input
          name={name}
          required={required}
          placeholder={placeholder}
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-baita-purple"
        />
      )}
    </div>
  );
}
