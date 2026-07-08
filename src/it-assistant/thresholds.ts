// Limiares de qualidade de rede voltados a videoconferência (Google Meet /
// Zoom / Teams) em home office. Baseados nas recomendações públicas desses
// provedores para chamadas em HD: latência baixa, jitter baixo, perda de
// pacotes mínima e banda suficiente para vídeo em ambas as direções.

export type Level = "ok" | "warning" | "critical";

export interface Metrics {
  latencyMs?: number | null;
  jitterMs?: number | null;
  packetLossPct?: number | null;
  downloadMbps?: number | null;
  uploadMbps?: number | null;
  dnsMs?: number | null;
}

export interface MetricVerdict {
  metric: string;
  level: Level;
  value: number;
  message: string;
}

const RANK: Record<Level, number> = { ok: 0, warning: 1, critical: 2 };

function worse(a: Level, b: Level): Level {
  return RANK[b] > RANK[a] ? b : a;
}

interface Rule {
  key: keyof Metrics;
  label: string;
  unit: string;
  // higher is worse (latency, jitter, loss, dns) vs. higher is better (bandwidth)
  higherIsWorse: boolean;
  warningAt: number;
  criticalAt: number;
}

const RULES: Rule[] = [
  { key: "latencyMs", label: "Latência", unit: "ms", higherIsWorse: true, warningAt: 100, criticalAt: 200 },
  { key: "jitterMs", label: "Jitter", unit: "ms", higherIsWorse: true, warningAt: 30, criticalAt: 50 },
  { key: "packetLossPct", label: "Perda de pacotes", unit: "%", higherIsWorse: true, warningAt: 1, criticalAt: 5 },
  { key: "dnsMs", label: "Resolução DNS", unit: "ms", higherIsWorse: true, warningAt: 150, criticalAt: 400 },
  { key: "downloadMbps", label: "Download", unit: "Mbps", higherIsWorse: false, warningAt: 5, criticalAt: 2 },
  { key: "uploadMbps", label: "Upload", unit: "Mbps", higherIsWorse: false, warningAt: 3, criticalAt: 1 },
];

function levelFor(rule: Rule, value: number): Level {
  if (rule.higherIsWorse) {
    if (value >= rule.criticalAt) return "critical";
    if (value >= rule.warningAt) return "warning";
    return "ok";
  }
  if (value <= rule.criticalAt) return "critical";
  if (value <= rule.warningAt) return "warning";
  return "ok";
}

export function evaluate(metrics: Metrics): { status: Level; verdicts: MetricVerdict[] } {
  const verdicts: MetricVerdict[] = [];
  let status: Level = "ok";

  for (const rule of RULES) {
    const raw = metrics[rule.key];
    if (raw === undefined || raw === null || Number.isNaN(raw)) continue;
    const level = levelFor(rule, raw);
    status = worse(status, level);
    if (level !== "ok") {
      const cmp = rule.higherIsWorse ? "acima de" : "abaixo de";
      const threshold = level === "critical" ? rule.criticalAt : rule.warningAt;
      verdicts.push({
        metric: rule.key,
        level,
        value: raw,
        message: `${rule.label} ${cmp} ${threshold}${rule.unit} (medido: ${raw}${rule.unit})`,
      });
    }
  }

  return { status, verdicts };
}

export const THRESHOLD_RULES = RULES;
