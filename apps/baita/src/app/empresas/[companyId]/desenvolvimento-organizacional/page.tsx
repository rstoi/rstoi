import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ADIZES_STAGE_LABELS } from "@/lib/labels";
import { getAdizesProfile, MANAGEMENT_LEVELS, suggestNextManagementLevel } from "@/lib/organizational-development-service";
import { updateAdizesStageAction, advanceManagementLevelAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DesenvolvimentoOrganizacionalPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });

  const profile = getAdizesProfile(company.lifecycleStageAdizes);
  const currentLevel = MANAGEMENT_LEVELS[company.managementSystemLevel];
  const nextLevel = suggestNextManagementLevel(company.managementSystemLevel);

  const updateStage = updateAdizesStageAction.bind(null, companyId);
  const advanceLevel = advanceManagementLevelAction.bind(null, companyId);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Desenvolvimento Organizacional</h1>
      <p className="mt-1 text-sm text-muted">Estágio de ciclo de vida (Adizes) e escada de maturidade de sistemas gerenciais.</p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="Estágio Adizes atual">
          <p className="text-lg font-semibold">{ADIZES_STAGE_LABELS[company.lifecycleStageAdizes]}</p>
          <p className="text-sm text-muted">Confiança da avaliação: {Math.round(company.lifecycleStageConfidence * 100)}%</p>

          <form action={updateStage} className="mt-4 space-y-2">
            <select name="observedStage" defaultValue={company.lifecycleStageAdizes} className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              {Object.entries(ADIZES_STAGE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <input
              name="stageConfidence"
              type="number"
              step="0.05"
              min="0"
              max="1"
              defaultValue="0.7"
              placeholder="Confiança (0 a 1)"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
            />
            <Button type="submit" variant="secondary">Atualizar estágio</Button>
          </form>
        </Card>

        <Card title="Sistema gerencial atual">
          <p className="text-lg font-semibold">Nível {currentLevel.level} — {currentLevel.name}</p>
          <ul className="mt-2 list-inside list-disc text-sm text-muted">
            {currentLevel.systems.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <div className="mt-4 rounded-md border border-baita-purple/30 bg-baita-purple/5 p-3">
            <p className="text-sm font-medium">Próximo nível mínimo viável: {nextLevel.level} — {nextLevel.name}</p>
            <ul className="mt-1 list-inside list-disc text-sm text-muted">
              {nextLevel.systems.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {currentLevel.level < 5 && (
              <form action={advanceLevel} className="mt-2">
                <Button type="submit" variant="secondary" className="text-xs">
                  Marcar nível {nextLevel.level} como implantado
                </Button>
              </form>
            )}
          </div>
        </Card>
      </div>

      <Card title="Diagnóstico por estágio Adizes" className="mt-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Section title="Riscos típicos" items={profile.typicalRisks} />
          <Section title="Foco financeiro" items={profile.financialFocus} />
          <Section title="Sistemas gerenciais prioritários" items={profile.prioritySystems} />
          <Section title="Próximos passos" items={profile.nextSteps} />
        </div>
        <p className="mt-4 text-sm">
          <strong>Governança adequada:</strong> {profile.adequateGovernance}
        </p>
        <p className="mt-1 text-sm">
          <strong>Tipo de interação humana:</strong> {profile.humanInteractionType}
        </p>
      </Card>

      <Card title="Escada de maturidade completa" className="mt-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {MANAGEMENT_LEVELS.map((level) => (
            <div key={level.level} className={`baita-card p-3 ${level.level === company.managementSystemLevel ? "border-baita-purple" : ""}`}>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-sm font-semibold">Nível {level.level} — {level.name}</p>
                {level.level === company.managementSystemLevel && <Badge color="purple">Atual</Badge>}
              </div>
              <p className="text-xs text-muted">{level.systems.join(" · ")}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{title}</p>
      <ul className="list-inside list-disc text-sm text-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
