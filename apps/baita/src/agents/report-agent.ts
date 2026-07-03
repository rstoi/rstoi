/**
 * ReportAgent — monta os relatórios executivos em HTML print-friendly a
 * partir dos dados já calculados por outros agentes/serviços, e persiste o
 * resultado como Report. A exportação para PDF é feita à parte (Playwright),
 * mantendo este agente livre de dependências de navegador.
 */
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";
import { prisma } from "@/lib/prisma";
import { TreasuryAgent } from "@/agents/treasury-agent";
import { formatCurrencyHtml, formatDateHtml, ratingBadgeHtml, renderReportShell } from "@/reports/shell";
import { LIQUIDITY_RISK_LABELS, TREASURY_SITUATION_LABELS } from "@/lib/treasury-service";
import { DIMENSION_LABELS } from "@/lib/director-evaluation-service";
import { ADIZES_STAGE_LABELS } from "@/lib/labels";
import type { ReportType } from "@prisma/client";

export type ReportAgentInput = {
  companyId: string;
  reportType: ReportType;
  periodStart?: Date;
  periodEnd?: Date;
  generatedById?: string;
};

export type ReportAgentOutput = { reportId: string; confidenceScore: number };

export class ReportAgent extends BaseAgent<ReportAgentInput, ReportAgentOutput> {
  readonly name = "ReportAgent";
  readonly version = "1.0.0";
  readonly description = "Gera relatórios executivos HTML print-friendly.";

  protected async execute(input: ReportAgentInput): Promise<AgentRunResult<ReportAgentOutput>> {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: input.companyId } });

    let title = "";
    let subtitle = "";
    let bodyHtml = "";
    let confidenceScore = 0.5;
    let periodLabel: string | undefined;

    switch (input.reportType) {
      case "INITIAL_DIAGNOSIS": {
        const result = await this.buildInitialDiagnosis(input.companyId);
        title = "Diagnóstico Financeiro Executivo";
        subtitle = "Leitura consolidada da situação financeira, forecast e recomendações.";
        bodyHtml = result.html;
        confidenceScore = result.confidence;
        break;
      }
      case "WEEKLY_TREASURY": {
        const result = await this.buildWeeklyTreasury(input.companyId);
        title = "Relatório Semanal de Tesouraria";
        subtitle = "Caixa atual, entradas esperadas, saídas obrigatórias e decisões pendentes.";
        bodyHtml = result.html;
        confidenceScore = result.confidence;
        break;
      }
      case "MONTHLY_FINANCIAL": {
        const result = await this.buildMonthlyFinancial(input.companyId);
        title = "Relatório Mensal Financeiro";
        subtitle = "DRE, caixa realizado, situação financeira, forecast, backtesting e PDCA.";
        bodyHtml = result.html;
        confidenceScore = result.confidence;
        break;
      }
      case "GOVERNANCE": {
        const result = await this.buildGovernance(input.companyId);
        title = "Relatório de Governança e Diretoria";
        subtitle = "Maturidade da diretoria, rituais, decisões, OKRs e plano de evolução.";
        bodyHtml = result.html;
        confidenceScore = result.confidence;
        break;
      }
      case "AUDIT": {
        const result = await this.buildAudit(input.companyId);
        title = "Relatório de Auditoria";
        subtitle = "Fontes, ratings, divergências, alterações manuais e agentes acionados.";
        bodyHtml = result.html;
        confidenceScore = result.confidence;
        break;
      }
      default: {
        title = "Resumo Executivo";
        subtitle = "Síntese da situação financeira atual.";
        const result = await this.buildInitialDiagnosis(input.companyId);
        bodyHtml = result.html;
        confidenceScore = result.confidence;
      }
    }

    if (input.periodStart && input.periodEnd) {
      periodLabel = `${formatDateHtml(input.periodStart)} a ${formatDateHtml(input.periodEnd)}`;
    }

    const generatedAt = new Date();
    const html = renderReportShell({
      title,
      subtitle,
      companyName: company.name,
      periodLabel,
      generatedAt,
      confidenceScore,
      bodyHtml,
    });

    const report = await prisma.report.create({
      data: {
        companyId: input.companyId,
        reportType: input.reportType,
        title,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        htmlContent: html,
        confidenceScore,
        generatedById: input.generatedById,
      },
    });

    return {
      output: { reportId: report.id, confidenceScore },
      confidence: confidenceScore,
      warnings: [],
      errors: [],
      ruleBasedMode: true,
    };
  }

  private async buildInitialDiagnosis(companyId: string) {
    const [treasury, lastDre, forecast, recommendations, dataSources] = await Promise.all([
      new TreasuryAgent().run({ companyId }),
      prisma.dRE.findFirst({ where: { companyId }, orderBy: { periodEnd: "desc" } }),
      prisma.forecast.findFirst({
        where: { companyId, scenario: "CONSERVATIVE" },
        orderBy: { createdAt: "desc" },
        include: { lines: { orderBy: { date: "asc" } } },
      }),
      prisma.recommendation.findMany({ where: { companyId, status: { in: ["OPEN", "IN_PROGRESS"] } }, take: 10 }),
      prisma.dataSource.findMany({ where: { companyId } }),
    ]);

    const t = treasury.output;
    const lowest = forecast?.lines.reduce(
      (acc, l) => (Number(l.closingBalance) < Number(acc.closingBalance) ? l : acc),
      forecast.lines[0]
    );

    const html = `
      <h2>Sumário executivo</h2>
      <p>Situação financeira atual: <strong>${TREASURY_SITUATION_LABELS[t.situation]}</strong>.
      Risco de liquidez: <strong>${LIQUIDITY_RISK_LABELS[t.liquidityRisk]}</strong>.</p>

      <h2>Qualidade dos dados</h2>
      <p>${dataSources.length} fonte(s) de dados cadastrada(s). Confiança do último DRE: ${
        lastDre ? Math.round(Number(lastDre.confidenceScore) * 100) : 0
      }%.</p>

      <h2>DRE gerencial (último período)</h2>
      ${
        lastDre
          ? `<table>
              <tr><td>Receita líquida</td><td>${formatCurrencyHtml(Number(lastDre.netRevenue))}</td></tr>
              <tr><td>Margem de contribuição</td><td>${formatCurrencyHtml(Number(lastDre.contributionMargin))}</td></tr>
              <tr><td>EBITDA gerencial</td><td>${formatCurrencyHtml(Number(lastDre.ebitda))}</td></tr>
              <tr><td>Resultado gerencial</td><td>${formatCurrencyHtml(Number(lastDre.managementResult))}</td></tr>
            </table>`
          : `<p class="footnote">Nenhum DRE gerado ainda.</p>`
      }

      <h2>Caixa e situação financeira</h2>
      <table>
        <tr><td>Caixa livre</td><td>${formatCurrencyHtml(t.freeCash)}</td></tr>
        <tr><td>Contas a receber vencidas</td><td>${formatCurrencyHtml(t.receivablesOverdue)}</td></tr>
        <tr><td>Contas a pagar vencidas</td><td>${formatCurrencyHtml(t.payablesOverdue)}</td></tr>
        <tr><td>Dívida total</td><td>${formatCurrencyHtml(t.totalDebt)}</td></tr>
      </table>

      <h2>Forecast 30 dias (cenário conservador)</h2>
      ${
        lowest
          ? `<p>Menor saldo projetado: <strong>${formatCurrencyHtml(Number(lowest.closingBalance))}</strong> em ${formatDateHtml(lowest.date)}.</p>`
          : `<p class="footnote">Nenhum forecast conservador gerado ainda.</p>`
      }

      <h2>Recomendações</h2>
      <ul>
        ${recommendations.map((r) => `<li>${r.title} — confiança ${ratingBadgeHtml(r.confidence)}</li>`).join("") || "<li>Nenhuma recomendação em aberto.</li>"}
      </ul>

      <div class="callout">
        Limitações: recomendações com rating C ou inferior exigem revisão humana antes de decisões críticas
        (pagamentos, crédito, investimento ou corte estrutural).
      </div>
    `;

    const confidence = lastDre ? Number(lastDre.confidenceScore) : 0.4;
    return { html, confidence };
  }

  private async buildWeeklyTreasury(companyId: string) {
    const [treasury, forecast, pendingDecisions] = await Promise.all([
      new TreasuryAgent().run({ companyId }),
      prisma.forecast.findFirst({
        where: { companyId, scenario: "CONSERVATIVE" },
        orderBy: { createdAt: "desc" },
        include: { lines: { orderBy: { date: "asc" }, take: 30 } },
      }),
      prisma.decision.findMany({ where: { companyId, status: "PLANNED" }, take: 10 }),
    ]);

    const t = treasury.output;
    const lowest = forecast?.lines.reduce(
      (acc, l) => (Number(l.closingBalance) < Number(acc.closingBalance) ? l : acc),
      forecast.lines[0]
    );

    const html = `
      <h2>Caixa atual</h2>
      <p>${formatCurrencyHtml(t.currentCash)} (caixa livre: ${formatCurrencyHtml(t.freeCash)})</p>

      <h2>Entradas esperadas x saídas obrigatórias (30 dias)</h2>
      <table>
        <thead><tr><th>Data</th><th>Saldo projetado</th></tr></thead>
        <tbody>
          ${
            forecast?.lines
              .map((l) => `<tr><td>${formatDateHtml(l.date)}</td><td>${formatCurrencyHtml(Number(l.closingBalance))}</td></tr>`)
              .join("") ?? `<tr><td colspan="2">Sem forecast gerado.</td></tr>`
          }
        </tbody>
      </table>

      <h2>Menor saldo em 30 dias</h2>
      <p>${lowest ? `${formatCurrencyHtml(Number(lowest.closingBalance))} em ${formatDateHtml(lowest.date)}` : "—"}</p>

      <h2>Decisões pendentes</h2>
      <ul>
        ${pendingDecisions.map((d) => `<li>${d.title} — prazo ${formatDateHtml(d.deadline)}</li>`).join("") || "<li>Nenhuma decisão pendente.</li>"}
      </ul>
    `;

    return { html, confidence: forecast?.confidenceScore ?? 0.4 };
  }

  private async buildMonthlyFinancial(companyId: string) {
    const [lastDre, treasury, forecast, lastBacktesting, pdcaRecords] = await Promise.all([
      prisma.dRE.findFirst({ where: { companyId }, orderBy: { periodEnd: "desc" } }),
      new TreasuryAgent().run({ companyId }),
      prisma.forecast.findFirst({ where: { companyId, scenario: "BASE" }, orderBy: { createdAt: "desc" } }),
      prisma.backtestingRun.findFirst({ where: { companyId }, orderBy: { runDate: "desc" } }),
      prisma.pDCARecord.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 5 }),
    ]);

    const t = treasury.output;

    const html = `
      <h2>DRE do período</h2>
      ${
        lastDre
          ? `<table>
              <tr><td>Receita líquida</td><td>${formatCurrencyHtml(Number(lastDre.netRevenue))}</td></tr>
              <tr><td>EBITDA gerencial</td><td>${formatCurrencyHtml(Number(lastDre.ebitda))}</td></tr>
              <tr><td>Resultado gerencial</td><td>${formatCurrencyHtml(Number(lastDre.managementResult))}</td></tr>
            </table>`
          : `<p class="footnote">Nenhum DRE gerado.</p>`
      }

      <h2>Situação financeira</h2>
      <p>${TREASURY_SITUATION_LABELS[t.situation]} — risco de liquidez ${LIQUIDITY_RISK_LABELS[t.liquidityRisk]}.</p>

      <h2>Forecast (cenário base)</h2>
      <p>Confiança: ${forecast ? Math.round(forecast.confidenceScore * 100) : 0}%</p>

      <h2>Backtesting</h2>
      ${
        lastBacktesting
          ? `<p>Acurácia: ${Math.round(lastBacktesting.accuracyScore * 100)}% · Viés: ${lastBacktesting.bias}</p>`
          : `<p class="footnote">Nenhum backtesting rodado.</p>`
      }

      <h2>PDCA</h2>
      <ul>
        ${pdcaRecords.map((p) => `<li>${p.cycleName} — status ${p.status}</li>`).join("") || "<li>Nenhum ciclo PDCA registrado.</li>"}
      </ul>
    `;

    return { html, confidence: lastDre ? Number(lastDre.confidenceScore) : 0.4 };
  }

  private async buildGovernance(companyId: string) {
    const [company, lastEvaluation, rituals, meetings] = await Promise.all([
      prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
      prisma.directorEvaluation.findFirst({ where: { companyId }, orderBy: { periodEnd: "desc" }, include: { items: true } }),
      prisma.governanceRitual.findMany({ where: { companyId, active: true } }),
      prisma.meetingRecord.findMany({ where: { companyId }, orderBy: { date: "desc" }, take: 5 }),
    ]);

    const dimensionRows = lastEvaluation
      ? Object.entries(DIMENSION_LABELS)
          .map(([, label]) => label)
          .join(", ")
      : "";

    const html = `
      <h2>Estágio Adizes</h2>
      <p>${ADIZES_STAGE_LABELS[company.lifecycleStageAdizes]}</p>

      <h2>Maturidade da diretoria</h2>
      ${
        lastEvaluation
          ? `<p>Score geral: <strong>${lastEvaluation.totalScore.toFixed(1)} / 5</strong> (dimensões avaliadas: ${dimensionRows}).</p>`
          : `<p class="footnote">Nenhuma avaliação de diretoria registrada.</p>`
      }

      <h2>Rituais ativos</h2>
      <ul>${rituals.map((r) => `<li>${r.name} (${r.frequency})</li>`).join("") || "<li>Nenhum ritual cadastrado.</li>"}</ul>

      <h2>Últimas atas</h2>
      <ul>${meetings.map((m) => `<li>${m.title} — ${formatDateHtml(m.date)}</li>`).join("") || "<li>Nenhuma ata registrada.</li>"}</ul>
    `;

    return { html, confidence: lastEvaluation ? 0.8 : 0.3 };
  }

  private async buildAudit(companyId: string) {
    const [dataSources, logs] = await Promise.all([
      prisma.dataSource.findMany({ where: { companyId } }),
      prisma.auditLog.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);

    const html = `
      <h2>Fontes de dados</h2>
      <table>
        <thead><tr><th>Nome</th><th>Tipo</th><th>Confiança inicial</th></tr></thead>
        <tbody>
          ${dataSources.map((s) => `<tr><td>${s.name}</td><td>${s.type}</td><td>${ratingBadgeHtml(s.confidenceInitial)}</td></tr>`).join("")}
        </tbody>
      </table>

      <h2>Trilha de auditoria (últimos 50 registros)</h2>
      <table>
        <thead><tr><th>Data</th><th>Ação</th><th>Entidade</th><th>Agente/Usuário</th></tr></thead>
        <tbody>
          ${logs
            .map(
              (l) =>
                `<tr><td>${formatDateHtml(l.createdAt)}</td><td>${l.action}</td><td>${l.entityType}</td><td>${l.agentName ?? l.actorUserId ?? "—"}</td></tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;

    return { html, confidence: 0.9 };
  }
}
