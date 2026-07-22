import { AlertTriangle, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Problem, Recommendation } from "@/types/domain";

const SEVERITY_VARIANT = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "warning",
  LOW: "secondary",
} as const;

const EFFORT_LABEL = {
  TRIVIAL: "minutes",
  SMALL: "an hour",
  MEDIUM: "half a day",
  LARGE: "a project",
} as const;

export function ProblemItem({ problem }: { problem: Problem }) {
  return (
    <div className="flex flex-col gap-2 border-l-2 border-destructive/40 pl-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={SEVERITY_VARIANT[problem.severity]}>{problem.severity.toLowerCase()}</Badge>
        <h4 className="text-sm font-medium">{problem.title}</h4>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{problem.detail}</p>

      {problem.evidence?.adQuote || problem.evidence?.pageQuote ? (
        <dl className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
          {problem.evidence.adQuote ? (
            <div className="flex flex-col gap-1">
              <dt className="label-mono">In the ad</dt>
              <dd className="font-mono text-xs leading-relaxed">{problem.evidence.adQuote}</dd>
            </div>
          ) : null}
          {problem.evidence.pageQuote ? (
            <div className="flex flex-col gap-1">
              <dt className="label-mono">On the page</dt>
              <dd className="font-mono text-xs leading-relaxed">{problem.evidence.pageQuote}</dd>
            </div>
          ) : null}
          {problem.evidence.selector ? (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <dt className="label-mono">Where</dt>
              <dd className="font-mono text-[11px] text-muted-foreground">{problem.evidence.selector}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

export function RecommendationItem({ recommendation }: { recommendation: Recommendation }) {
  return (
    <div className="flex flex-col gap-2 border-l-2 border-primary/40 pl-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-medium">{recommendation.title}</h4>
        <Badge variant="outline" className="font-mono text-[10px]">
          +{recommendation.impact} pts
        </Badge>
        <Badge variant="secondary" className="font-mono text-[10px]">
          {EFFORT_LABEL[recommendation.effort]}
        </Badge>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{recommendation.detail}</p>
      {recommendation.example ? (
        <p className="rounded-md bg-primary/5 p-3 font-mono text-xs leading-relaxed">{recommendation.example}</p>
      ) : null}
    </div>
  );
}

export function CriticalIssues({ issues }: { issues: Problem[] }) {
  if (issues.length === 0) return null;
  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-destructive" aria-hidden />
          Fix these first
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {issues.map((issue) => (
          <ProblemItem key={issue.id} problem={issue} />
        ))}
      </CardContent>
    </Card>
  );
}

export function QuickWins({ wins }: { wins: Recommendation[] }) {
  if (wins.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="size-4 text-primary" aria-hidden />
          Quick wins
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {wins.map((win) => (
          <RecommendationItem key={win.id} recommendation={win} />
        ))}
      </CardContent>
    </Card>
  );
}

export function StrengthsWeaknesses({ strengths, weaknesses }: { strengths: string[]; weaknesses: string[] }) {
  const columns = [
    { title: "What works", items: strengths, dot: "bg-success" },
    { title: "What does not", items: weaknesses, dot: "bg-destructive" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {columns.map((column) => (
        <Card key={column.title}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{column.title}</CardTitle>
          </CardHeader>
          <CardContent>
            {column.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing noted.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {column.items.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed">
                    <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", column.dot)} aria-hidden />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
