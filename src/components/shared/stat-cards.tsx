"use client";

import { useUsage } from "@/hooks/use-usage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { gradeTone } from "./score-badge";
import { cn } from "@/lib/utils";

const TONE_TEXT = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  muted: "text-foreground",
} as const;

export function StatCards() {
  const { data, isPending } = useUsage();

  if (isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }
  if (!data) return null;

  const { stats, usage } = data;

  const cards = [
    { label: "Analyses run", value: String(stats.total), hint: "all time" },
    {
      label: "Average score",
      value: stats.averageScore === null ? "—" : String(stats.averageScore),
      hint: "across completed reports",
      tone: gradeTone(stats.averageScore),
    },
    { label: "Completed", value: String(stats.completed), hint: `${stats.failed} failed` },
    { label: "Left this month", value: String(usage.analysesRemaining), hint: `of ${usage.analysesLimit} on ${usage.plan}` },
  ] as const;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardHeader className="pb-2">
            <CardTitle className="label-mono font-normal">{card.label}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-0.5">
            <span
              className={cn(
                "font-mono text-2xl font-semibold tracking-tight",
                "tone" in card && card.tone ? TONE_TEXT[card.tone] : "text-foreground",
              )}
            >
              {card.value}
            </span>
            <span className="text-xs text-muted-foreground">{card.hint}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
