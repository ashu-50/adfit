"use client";

import Link from "next/link";
import { useUsage } from "@/hooks/use-usage";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { clamp } from "@/lib/utils";

export function UsageMeter() {
  const { data, isPending } = useUsage();

  if (isPending) return <Skeleton className="h-14 w-full" />;
  if (!data) return null;

  const { analysesRun, analysesLimit } = data.usage;
  const pct = analysesLimit > 0 ? clamp((analysesRun / analysesLimit) * 100, 0, 100) : 0;
  const exhausted = analysesRun >= analysesLimit;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-mono">This month</span>
        <span className="font-mono text-xs">
          {analysesRun}<span className="text-muted-foreground">/{analysesLimit}</span>
        </span>
      </div>
      <Progress value={pct} aria-label={`${analysesRun} of ${analysesLimit} analyses used`} />
      {exhausted ? (
        <Link href="/settings/billing" className="text-xs text-primary underline underline-offset-4">
          Out of analyses — upgrade
        </Link>
      ) : null}
    </div>
  );
}
