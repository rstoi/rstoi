/**
 * Shell HTML compartilhado por todos os relatórios Baita — capa executiva,
 * tipografia sóbria e identidade visual (roxo/azul profundo/magenta).
 * Os relatórios são documentos HTML autocontidos (CSS inline), pensados
 * para impressão e para conversão em PDF via Playwright.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatCurrencyHtml(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDateHtml(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function renderReportShell(params: {
  title: string;
  subtitle: string;
  companyName: string;
  periodLabel?: string;
  generatedAt: Date;
  confidenceScore: number;
  bodyHtml: string;
}): string {
  const { title, subtitle, companyName, periodLabel, generatedAt, confidenceScore, bodyHtml } = params;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} — ${escapeHtml(companyName)}</title>
<style>
  :root {
    --purple: #4b2e83;
    --purple-dark: #2f1c54;
    --blue: #16213e;
    --magenta: #b0266f;
    --good: #1f7a4d;
    --warning: #b7791f;
    --critical: #b3261e;
    --border: #e2e2e6;
    --muted: #6b6b73;
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Helvetica Neue", Arial, sans-serif;
    color: #1b1b1f;
    margin: 0;
    background: #fff;
  }
  .cover {
    background: linear-gradient(120deg, var(--blue) 0%, var(--purple) 55%, var(--magenta) 100%);
    color: #fff;
    padding: 56px 48px;
  }
  .cover .brand {
    font-size: 13px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.85;
  }
  .cover h1 {
    font-size: 30px;
    margin: 18px 0 6px;
  }
  .cover .subtitle {
    font-size: 15px;
    opacity: 0.9;
  }
  .cover .meta {
    margin-top: 28px;
    font-size: 12px;
    opacity: 0.85;
    display: flex;
    gap: 24px;
  }
  .content {
    padding: 32px 48px 64px;
  }
  h2 {
    font-size: 16px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--purple);
    border-bottom: 1px solid var(--border);
    padding-bottom: 6px;
    margin-top: 32px;
  }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
  th { text-align: left; color: var(--muted); font-size: 11px; text-transform: uppercase; padding: 6px 8px; border-bottom: 1px solid var(--border); }
  td { padding: 6px 8px; border-bottom: 1px solid var(--border); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge-good { background: rgba(31,122,77,0.1); color: var(--good); }
  .badge-warning { background: rgba(183,121,31,0.1); color: var(--warning); }
  .badge-critical { background: rgba(179,38,30,0.1); color: var(--critical); }
  .badge-neutral { background: rgba(107,107,115,0.1); color: var(--muted); }
  .badge-purple { background: rgba(75,46,131,0.1); color: var(--purple); }
  .footnote { font-size: 11px; color: var(--muted); margin-top: 6px; }
  .callout { border: 1px solid var(--border); border-left: 4px solid var(--purple); padding: 12px 16px; margin-top: 12px; font-size: 13px; background: #faf9fc; }
  ul { margin: 6px 0; padding-left: 18px; font-size: 13px; }
  @media print {
    .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .content { padding: 24px 32px; }
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="brand">Baita Financial Intelligence OS</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="subtitle">${escapeHtml(subtitle)}</div>
    <div class="meta">
      <span>Empresa: ${escapeHtml(companyName)}</span>
      ${periodLabel ? `<span>Período: ${escapeHtml(periodLabel)}</span>` : ""}
      <span>Gerado em: ${formatDateHtml(generatedAt)}</span>
      <span>Confiança geral: ${Math.round(confidenceScore * 100)}%</span>
    </div>
  </div>
  <div class="content">
    ${bodyHtml}
    <p class="footnote">
      Este relatório separa fato, inferência e hipótese. Toda conclusão possui fonte, período, premissa, rating de
      confiabilidade e limitação associados. Ratings D e E não devem embasar decisões críticas sem revisão humana.
    </p>
  </div>
</body>
</html>`;
}

export function ratingBadgeHtml(rating: string): string {
  const cls = rating === "A" || rating === "B" ? "badge-good" : rating === "C" ? "badge-warning" : rating === "D" || rating === "E" ? "badge-critical" : "badge-neutral";
  return `<span class="badge ${cls}">${escapeHtml(rating)}</span>`;
}
