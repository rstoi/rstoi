type Status = "good" | "warning" | "critical" | "neutral";

const STATUS_CLASSES: Record<Status, string> = {
  good: "text-status-good",
  warning: "text-status-warning",
  critical: "text-status-critical",
  neutral: "text-foreground",
};

export function StatCard({
  label,
  value,
  status = "neutral",
  hint,
}: {
  label: string;
  value: string;
  status?: Status;
  hint?: string;
}) {
  return (
    <div className="baita-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${STATUS_CLASSES[status]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
