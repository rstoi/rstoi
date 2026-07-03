import type { ReliabilityRating } from "@prisma/client";
import { ratingColor, ratingLabel } from "@/lib/rating-service";

const COLOR_CLASSES: Record<string, string> = {
  green: "bg-status-good/10 text-status-good border-status-good/30",
  yellow: "bg-status-warning/10 text-status-warning border-status-warning/30",
  red: "bg-status-critical/10 text-status-critical border-status-critical/30",
  gray: "bg-status-neutral/10 text-status-neutral border-status-neutral/30",
};

export function Badge({
  children,
  color = "gray",
  className = "",
  title,
}: {
  children: React.ReactNode;
  color?: "green" | "yellow" | "red" | "gray" | "purple";
  className?: string;
  title?: string;
}) {
  const purple = "bg-baita-purple/10 text-baita-purple border-baita-purple/30";
  const classes = color === "purple" ? purple : COLOR_CLASSES[color];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${classes} ${className}`}
    >
      {children}
    </span>
  );
}

export function RatingBadge({ rating }: { rating: ReliabilityRating }) {
  return (
    <Badge color={ratingColor(rating)} className="whitespace-nowrap" title={ratingLabel(rating)}>
      {rating}
    </Badge>
  );
}
