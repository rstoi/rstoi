import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CAREER_STAGE_LABELS } from "@/lib/labels";
import { createPersonAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PessoasPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const people = await prisma.person.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });

  const createPerson = createPersonAction.bind(null, companyId);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Pessoas e Perfil Humano</h1>
      <p className="mt-1 text-sm text-muted">
        Papel formal e real, estágio de carreira, canal preferido e confiabilidade por tema.
      </p>

      <Card className="mt-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2">Nome</th>
              <th className="pb-2">Papel formal / real</th>
              <th className="pb-2">Estágio de carreira</th>
              <th className="pb-2">Canal preferido</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {people.map((person) => (
              <tr key={person.id}>
                <td className="py-2.5">
                  <Link href={`/empresas/${companyId}/pessoas/${person.id}`} className="font-medium text-baita-purple hover:underline">
                    {person.name}
                  </Link>
                  <p className="text-xs text-muted">{person.email}</p>
                </td>
                <td className="py-2.5 text-muted">
                  {person.formalRole ?? "—"} {person.realRole && person.realRole !== person.formalRole ? `/ ${person.realRole}` : ""}
                </td>
                <td className="py-2.5">
                  <Badge color="purple">{CAREER_STAGE_LABELS[person.careerStage]}</Badge>
                </td>
                <td className="py-2.5 text-muted">{person.preferredChannel ?? "—"}</td>
                <td className="py-2.5">
                  <Badge color={person.active ? "green" : "gray"}>{person.active ? "Ativo" : "Inativo"}</Badge>
                </td>
              </tr>
            ))}
            {people.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-muted">
                  Nenhuma pessoa cadastrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Nova pessoa" className="mt-6">
        <form action={createPerson} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField name="name" label="Nome *" required />
          <TextField name="email" label="E-mail" type="email" />
          <TextField name="phone" label="Telefone" />
          <TextField name="formalRole" label="Papel formal" placeholder="Ex.: Diretor Financeiro" />
          <TextField name="realRole" label="Papel real" placeholder="Ex.: Decide tudo sozinho" />
          <SelectField
            name="careerStage"
            label="Estágio de carreira"
            options={Object.entries(CAREER_STAGE_LABELS)}
          />
          <TextField name="preferredChannel" label="Canal preferido" placeholder="WhatsApp, e-mail, reunião..." />
          <TextField name="preferredFormat" label="Formato preferido" placeholder="Texto curto, tabela, reunião..." />
          <TextField name="bestInteractionWindow" label="Melhor janela de interação" placeholder="Manhã, entre reuniões..." className="md:col-span-2" />
          <div className="md:col-span-2">
            <Button type="submit">Cadastrar pessoa</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function TextField({
  name,
  label,
  type = "text",
  required,
  placeholder,
  className = "",
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-baita-purple"
      />
    </div>
  );
}

function SelectField({ name, label, options }: { name: string; label: string; options: [string, string][] }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <select
        name={name}
        className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-baita-purple"
      >
        {options.map(([value, opLabel]) => (
          <option key={value} value={value}>
            {opLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
