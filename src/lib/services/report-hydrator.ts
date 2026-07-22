import type { AdCluster, DimensionScore, Report } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getAnalysisDetail } from "@/lib/db/repositories/analysis";
import { notFound } from "@/lib/http/errors";
import type { AdAngle, AdClusterResult, DimensionKey, DimensionResult, FitReport, LandingBlueprint, Problem, Recommendation } from "@/types/domain";

/**
 * Rebuilds the typed FitReport from its normalised rows.
 *
 * The report is stored split across `reports`, `dimension_scores` and
 * `ad_clusters` so it stays queryable (average score per dimension, grade
 * distribution), but every consumer — the report page, all four exporters —
 * wants the whole object. This is the single place that reassembly happens.
 */

type ReportRow = Report & { dimensions: DimensionScore[] };
type ClusterRow = AdCluster & { ads: { position: number }[] };

/**
 * The pure half, taking rows the caller has already loaded.
 *
 * Split out because the analysis detail endpoint fetches the report as part of
 * a larger query and previously returned it raw — the UI expected a FitReport
 * and received database rows, so every completed report rendered blank while
 * the exporters, which did hydrate, worked fine. Sharing the mapping rather
 * than the query is what stops those two paths diverging again.
 */
export function toFitReport(analysisId: string, row: ReportRow, clusterRows: ClusterRow[]): FitReport {
  const dimensions: DimensionResult[] = row.dimensions.map((d) => ({
    dimension: d.dimension as DimensionKey,
    score: d.score,
    weight: d.weight,
    weightedScore: d.weightedScore,
    confidence: d.confidence,
    applicable: d.applicable,
    summary: d.summary,
    problems: (d.problems as unknown as Problem[]) ?? [],
    recommendations: (d.recommendations as unknown as Recommendation[]) ?? [],
  }));

  const clusters: AdClusterResult[] = clusterRows.map((c) => ({
    angle: c.angle as AdAngle,
    label: c.label,
    rationale: c.rationale,
    adIndexes: c.ads.map((a) => a.position).sort((a, b) => a - b),
    blueprint: c.blueprint as unknown as LandingBlueprint,
  }));

  return {
    analysisId,
    overallScore: row.overallScore,
    grade: row.grade as FitReport["grade"],
    confidence: row.confidence,
    summary: row.summary,
    verdict: row.verdict,
    strengths: (row.strengths as unknown as string[]) ?? [],
    weaknesses: (row.weaknesses as unknown as string[]) ?? [],
    criticalIssues: (row.criticalIssues as unknown as Problem[]) ?? [],
    quickWins: (row.quickWins as unknown as Recommendation[]) ?? [],
    rewrites: (row.rewrites as unknown as FitReport["rewrites"]) ?? {},
    dimensions,
    clusters,
  };
}

/** Fetching wrapper for callers that only want the report, such as the exporters. */
export async function hydrateReport(userId: string, analysisId: string): Promise<{
  report: FitReport;
  url: string;
  title: string;
  createdAt: Date;
}> {
  const analysis = await prisma.analysis.findFirst({
    where: { id: analysisId, userId },
    include: {
      report: { include: { dimensions: true } },
      clusters: { include: { ads: { select: { position: true } } } },
    },
  });

  if (!analysis) throw notFound("That analysis does not exist, or is not yours.");
  if (!analysis.report) throw notFound("This analysis has no report yet.");

  return {
    report: toFitReport(analysis.id, analysis.report, analysis.clusters),
    url: analysis.targetUrl,
    title: analysis.title,
    createdAt: analysis.completedAt ?? analysis.createdAt,
  };
}

/**
 * The shape the analysis detail endpoint returns.
 *
 * Named rather than inlined into the route so `types/api.ts` can derive the
 * client type from it. When the two were described separately, the UI's idea of
 * the response drifted from the real one and nothing failed until runtime.
 */
export async function getAnalysisView(userId: string, analysisId: string) {
  const analysis = await getAnalysisDetail(userId, analysisId);
  const { clusters, ...rest } = analysis;

  return {
    ...rest,
    report: analysis.report ? toFitReport(analysis.id, analysis.report, clusters) : null,
  };
}
