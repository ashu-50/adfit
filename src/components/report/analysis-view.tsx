"use client";

import Link from "next/link";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAnalysis } from "@/hooks/use-analysis";
import { useRerunAnalysis } from "@/hooks/use-analyses";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PromiseDiff, type DiffPair } from "@/components/shared/promise-diff";
import { formatDuration } from "@/lib/format";
import { hostnameOf } from "@/lib/utils";
import { ScoreHeader } from "./score-header";
import { CriticalIssues, QuickWins, StrengthsWeaknesses } from "./findings";
import { DimensionBreakdown } from "./dimension-breakdown";
import { ClusterCards } from "./cluster-cards";
import { Rewrites } from "./rewrites";
import { ExportMenu } from "./export-menu";
import { ProgressStream } from "./progress-stream";
import type { AnalysisDetail } from "@/types/api";
import type { FitReport } from "@/types/domain";

const RUNNING = new Set(["QUEUED", "EXTRACTING", "OCR", "ANALYZING", "SCORING"]);

/**
 * Builds the headline comparison from the report's own evidence.
 *
 * The dimensions that carry quoted evidence are exactly the ones a reader wants
 * to see side by side, so the summary diff is derived rather than authored — it
 * cannot drift from the findings below it.
 */
function toDiffPairs(report: FitReport): DiffPair[] {
  const interesting = ["MESSAGE_MATCH", "OFFER_MATCH", "CTA_MATCH", "PERSONA_MATCH", "PRODUCT_FRAMING"] as const;

  return interesting
    .map((key) => {
      const dimension = report.dimensions.find((d) => d.dimension === key);
      if (!dimension?.applicable) return null;

      const evidence = dimension.problems.find((p) => p.evidence?.adQuote || p.evidence?.pageQuote)?.evidence;
      if (!evidence?.adQuote && !evidence?.pageQuote) return null;

      return {
        label: key.replace("_MATCH", "").replace("_", " ").toLowerCase(),
        ad: evidence.adQuote ?? "—",
        page: evidence.pageQuote ?? "—",
        verdict: dimension.score >= 70 ? "match" : dimension.score >= 55 ? "drift" : "break",
      } satisfies DiffPair;
    })
    .filter((pair): pair is DiffPair => pair !== null);
}

function ReportBody({ analysis, report }: { analysis: AnalysisDetail; report: FitReport }) {
  const pairs = toDiffPairs(report);

  return (
    <div className="flex flex-col gap-6">
      <ScoreHeader report={report} />

      {pairs.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-medium">Where the promise went</h2>
          <PromiseDiff pairs={pairs} />
        </div>
      ) : null}

      <CriticalIssues issues={report.criticalIssues} />
      <QuickWins wins={report.quickWins} />
      <StrengthsWeaknesses strengths={report.strengths} weaknesses={report.weaknesses} />
      <DimensionBreakdown dimensions={report.dimensions} />
      <Rewrites rewrites={report.rewrites} />
      {analysis.ads.length > 1 ? <ClusterCards clusters={report.clusters} /> : null}

      {analysis.landingPage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How the page was read</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Method", value: analysis.landingPage.strategy.toLowerCase() },
                { label: "Status", value: String(analysis.landingPage.httpStatus) },
                { label: "Words read", value: analysis.landingPage.wordCount.toLocaleString() },
                { label: "Fetch time", value: formatDuration(analysis.landingPage.fetchDurationMs) },
              ].map((item) => (
                <div key={item.label} className="flex flex-col gap-1">
                  <dt className="label-mono">{item.label}</dt>
                  <dd className="font-mono text-sm">{item.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function AnalysisView({ analysisId }: { analysisId: string }) {
  const { data: analysis, isPending, isError, error } = useAnalysis(analysisId);
  const rerun = useRerunAnalysis();

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !analysis) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load this analysis</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "It may have been deleted."}{" "}
          <Link href="/analyses" className="underline underline-offset-4">
            Back to all analyses
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  const running = RUNNING.has(analysis.status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="label-mono">Report</p>
            {analysis.project ? (
              <Badge variant="outline" className="gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: analysis.project.color }} aria-hidden />
                {analysis.project.name}
              </Badge>
            ) : null}
            <Badge variant="secondary" className="font-mono text-[10px]">
              {analysis.ads.length} {analysis.ads.length === 1 ? "ad" : "ads"}
            </Badge>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-balance">{analysis.title}</h1>

          <a
            href={analysis.targetUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex w-fit items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {hostnameOf(analysis.targetUrl)}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={rerun.isPending}
            onClick={() =>
              rerun.mutate(analysis.id, {
                onSuccess: (res) => {
                  toast.success("Re-running with fresh data.");
                  window.location.href = `/analyses/${res.data.id}`;
                },
                onError: (err) => toast.error(err instanceof Error ? err.message : "Could not re-run."),
              })
            }
          >
            {rerun.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Run again
          </Button>
          {analysis.report ? <ExportMenu analysisId={analysis.id} /> : null}
        </div>
      </div>

      {running ? (
        <ProgressStream analysisId={analysis.id} initialProgress={analysis.progress} initialStage={analysis.stage} />
      ) : analysis.status === "FAILED" ? (
        <Alert variant="destructive">
          <AlertTitle>This analysis failed</AlertTitle>
          <AlertDescription>{analysis.error ?? "Something went wrong while reading the page."}</AlertDescription>
        </Alert>
      ) : analysis.report ? (
        <ReportBody analysis={analysis} report={analysis.report} />
      ) : (
        <Alert>
          <AlertTitle>No report on this analysis</AlertTitle>
          <AlertDescription>It finished without producing one. Running it again usually fixes that.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
