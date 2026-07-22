import { cn } from "@/lib/utils";

/** Grade bands mirror src/lib/scoring/weights.ts. */
export function gradeTone(score: number | null | undefined): "success" | "warning" | "destructive" | "muted" {
  if (score === null || score === undefined) return "muted";
  if (score >= 70) return "success";
  if (score >= 55) return "warning";
  return "destructive";
}

const TONE_CLASS = {
  success: "text-success border-success/30 bg-success/10",
  warning: "text-warning border-warning/30 bg-warning/10",
  destructive: "text-destructive border-destructive/30 bg-destructive/10",
  muted: "text-muted-foreground border-border bg-muted/40",
} as const;

export function ScoreBadge({
  score,
  grade,
  className,
}: {
  score: number | null | undefined;
  grade?: string | null;
  className?: string;
}) {
  const tone = gradeTone(score);
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 rounded-md border px-2 py-0.5 font-mono text-xs font-medium",
        TONE_CLASS[tone],
        className,
      )}
    >
      {score === null || score === undefined ? "—" : score}
      {grade ? <span className="opacity-70">{grade}</span> : null}
    </span>
  );
}
