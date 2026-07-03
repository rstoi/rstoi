import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge, RatingBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { CAREER_STAGE_LABELS } from "@/lib/labels";
import { HumanProfileAgent } from "@/agents/human-profile-agent";
import { CadenceAgent } from "@/agents/cadence-agent";
import { setTopicReliabilityAction, generateAccountantRequestAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ companyId: string; personId: string }>;
}) {
  const { companyId, personId } = await params;
  const person = await prisma.person.findFirst({ where: { id: personId, companyId } });
  if (!person) notFound();

  const [profileResult, cadenceResult, interactions] = await Promise.all([
    new HumanProfileAgent().run({ personId }),
    new CadenceAgent().run({ personId }),
    prisma.humanInteraction.findMany({ where: { personId }, orderBy: { sentAt: "desc" }, take: 10 }),
  ]);

  const setTopic = setTopicReliabilityAction.bind(null, companyId, personId);
  const generateRequest = generateAccountantRequestAction.bind(null, companyId, personId);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{person.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {person.formalRole ?? "Papel não informado"} · {CAREER_STAGE_LABELS[person.careerStage]}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Abordagem recomendada">
          <ul className="list-inside list-disc space-y-1 text-sm">
            {profileResult.output.approach.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
        <Card title="Cadência de interação">
          <p className="text-sm">
            Pode ser contatado agora?{" "}
            <Badge color={cadenceResult.output.canContactNow ? "green" : "red"}>
              {cadenceResult.output.canContactNow ? "Sim" : "Não"}
            </Badge>
          </p>
          <p className="mt-2 text-sm text-muted">{cadenceResult.output.reason}</p>
          {cadenceResult.output.suggestedWindow && (
            <p className="mt-1 text-sm text-muted">Janela sugerida: {cadenceResult.output.suggestedWindow}</p>
          )}
        </Card>
      </div>

      <Card title="Confiabilidade por tema" className="mt-6">
        <ul className="mb-4 space-y-2">
          {profileResult.output.topicReliability.map((t) => (
            <li key={t.topic} className="flex items-center justify-between text-sm">
              <span>{t.topic}</span>
              <RatingBadge rating={t.rating as never} />
            </li>
          ))}
          {profileResult.output.topicReliability.length === 0 && (
            <p className="text-sm text-muted">Nenhum tema avaliado ainda.</p>
          )}
        </ul>
        <form action={setTopic} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Tema</label>
            <input name="topic" required placeholder="Ex.: fluxo de caixa" className="rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Rating</label>
            <select name="rating" className="rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              {["A", "B", "C", "D", "E", "UNKNOWN"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary">
            Salvar
          </Button>
        </form>
      </Card>

      {person.formalRole?.toLowerCase().includes("contad") || person.realRole?.toLowerCase().includes("contad") ? (
        <Card title="Solicitar documentos ao contador" className="mt-6">
          <form action={generateRequest} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Competência</label>
              <input name="competence" placeholder="Ex.: junho/2026" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Itens (separados por vírgula)</label>
              <input
                name="items"
                defaultValue="balancete, DRE contábil, razão de empréstimos, guias fiscais, parcelamentos ativos"
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" variant="secondary">
              Gerar mensagem
            </Button>
          </form>
        </Card>
      ) : null}

      <Card title="Últimas interações" className="mt-6">
        <ul className="divide-y divide-border">
          {interactions.map((interaction) => (
            <li key={interaction.id} className="py-2.5 text-sm">
              <p className="text-xs text-muted">
                {interaction.channel} · {formatDateTime(interaction.sentAt)}
              </p>
              <p>{interaction.messageText}</p>
            </li>
          ))}
          {interactions.length === 0 && <p className="py-2 text-sm text-muted">Nenhuma interação registrada.</p>}
        </ul>
      </Card>
    </div>
  );
}
