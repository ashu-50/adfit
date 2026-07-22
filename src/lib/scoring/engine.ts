import { DIMENSIONS, type DimensionKey, type DimensionResult, type FitReport, type Problem, type Recommendation, type ReportGrade } from "@/types/domain";
import { CRITICAL_CEILINGS, DIMENSION_WEIGHTS, GRADE_BANDS, LOW_CONFIDENCE_FLOOR } from "./weights";
import type { RawAnalysisResult } from "@/lib/ai/schemas";
import { clamp, round } from "@/lib/utils";

let counter = 0;
function stableId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

/**
 * The model proposes; the engine decides.
 *
 * Asking an LLM for one overall number produces scores that drift between runs
 * and cannot be explained to a client. Instead the model returns per-dimension
 * judgements with evidence, and this pure function composes them the same way
 * every time: weight, redistribute inapplicable weight, damp low-confidence
 * dimensions toward the mean, then apply critical-failure ceilings.
 *
 * Pure and synchronous by design — it is the one part of the pipeline that can
 * be unit tested exhaustively without a network.
 */
export function computeReport(args: {
  analysisId: string;
  raw: RawAnalysisResult;
  hasScreenshots: boolean;
}): Omit<FitReport, "clusters"> {
  const byKey = new Map(args.raw.dimensions.map((d) => [d.dimension, d]));

  const prepared = DIMENSIONS.map<DimensionResult & { rawWeight: number }>((key) => {
    const source = byKey.get(key);
    const applicable = resolveApplicability(key, source?.applicable ?? true, args.hasScreenshots);
    const confidence = clamp((source?.confidence ?? 60) / 100, 0, 1);

    // A 30-confidence "score: 20" is a guess, not a finding. Pull it toward 50
    // proportionally so uncertainty softens the verdict instead of driving it.
    const rawScore = clamp(source?.score ?? 50, 0, 100);
    const damping = Math.max(LOW_CONFIDENCE_FLOOR, confidence);
    const score = Math.round(50 + (rawScore - 50) * damping);

    return {
      dimension: key,
      score: applicable ? score : 0,
      weight: 0,
      weightedScore: 0,
      confidence: round(confidence, 2),
      applicable,
      summary: source?.summary ?? "Not enough evidence on the page to judge this.",
      problems: (source?.problems ?? []).map<Problem>((p) => ({
        id: stableId("prb"),
        severity: p.severity,
        title: p.title,
        detail: p.detail,
        evidence: {
          adQuote: p.evidence.adQuote || undefined,
          pageQuote: p.evidence.pageQuote || undefined,
          selector: p.evidence.selector || undefined,
        },
      })),
      recommendations: (source?.recommendations ?? []).map<Recommendation>((r) => ({
        id: stableId("rec"),
        priority: r.priority,
        effort: r.effort,
        impact: Math.round(r.impact),
        title: r.title,
        detail: r.detail,
        example: r.example || undefined,
      })),
      rawWeight: DIMENSION_WEIGHTS[key],
    };
  });

  const applicableWeight = prepared.filter((d) => d.applicable).reduce((sum, d) => sum + d.rawWeight, 0);
  const scale = applicableWeight > 0 ? 1 / applicableWeight : 0;

  const dimensions: DimensionResult[] = prepared.map(({ rawWeight, ...d }) => {
    const weight = d.applicable ? round(rawWeight * scale, 4) : 0;
    return { ...d, weight, weightedScore: round(d.score * weight, 2) };
  });

  let overall = Math.round(dimensions.reduce((sum, d) => sum + d.weightedScore, 0));

  for (const dimension of dimensions) {
    if (!dimension.applicable) continue;
    const ceiling = CRITICAL_CEILINGS[dimension.dimension];
    if (ceiling !== undefined && dimension.problems.some((p) => p.severity === "CRITICAL")) {
      overall = Math.min(overall, ceiling);
    }
  }
  overall = clamp(overall, 0, 100);

  const band = GRADE_BANDS.find((b) => overall >= b.min) ?? GRADE_BANDS[GRADE_BANDS.length - 1]!;

  const applicableDims = dimensions.filter((d) => d.applicable);
  const confidence = applicableDims.length > 0
    ? round(applicableDims.reduce((sum, d) => sum + d.confidence, 0) / applicableDims.length, 2)
    : 0.5;

  return {
    analysisId: args.analysisId,
    overallScore: overall,
    grade: band.grade as ReportGrade,
    confidence,
    summary: args.raw.summary,
    verdict: args.raw.verdict || band.verdict,
    strengths: args.raw.strengths,
    weaknesses: args.raw.weaknesses,
    criticalIssues: collectCriticalIssues(dimensions),
    quickWins: collectQuickWins(dimensions),
    rewrites: {
      headline: args.raw.rewrites.headline,
      subheadline: args.raw.rewrites.subheadline,
      cta: args.raw.rewrites.cta,
      heroAngle: args.raw.rewrites.heroAngle,
    },
    dimensions,
  };
}

function resolveApplicability(key: DimensionKey, modelSaid: boolean, hasScreenshots: boolean): boolean {
  // The one case where the app overrules the model: it cannot compare visuals
  // it was never shown, whatever it claims.
  if (key === "VISUAL_CONTINUITY") return hasScreenshots && modelSaid;
  return modelSaid;
}

const SEVERITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

function collectCriticalIssues(dimensions: DimensionResult[]): Problem[] {
  return dimensions
    .filter((d) => d.applicable)
    .flatMap((d) => d.problems)
    .filter((p) => p.severity === "CRITICAL" || p.severity === "HIGH")
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, 8);
}

const EFFORT_RANK = { TRIVIAL: 0, SMALL: 1, MEDIUM: 2, LARGE: 3 } as const;

/**
 * A quick win is high impact and low effort. Ranking by impact alone surfaces
 * "rebuild the hero", which is true but not a quick win, so effort is the
 * tiebreak and LARGE is excluded outright.
 */
function collectQuickWins(dimensions: DimensionResult[]): Recommendation[] {
  return dimensions
    .filter((d) => d.applicable)
    .flatMap((d) => d.recommendations)
    .filter((r) => r.effort !== "LARGE" && r.impact >= 5)
    .sort((a, b) => b.impact - a.impact || EFFORT_RANK[a.effort] - EFFORT_RANK[b.effort])
    .slice(0, 6);
}

export function scoreTone(score: number): "success" | "warning" | "destructive" {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "destructive";
}
