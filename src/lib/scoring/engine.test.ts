import { describe, expect, it } from "vitest";
import { computeReport } from "./engine";
import { DIMENSIONS } from "@/types/domain";
import type { RawAnalysisResult } from "@/lib/ai/schemas";

function raw(overrides: Partial<Record<string, unknown>> = {}): RawAnalysisResult {
  return {
    summary: "s",
    verdict: "v",
    strengths: [],
    weaknesses: [],
    rewrites: { headline: [], subheadline: [], cta: [], heroAngle: [] },
    dimensions: DIMENSIONS.map((dimension) => ({
      dimension,
      score: 80,
      confidence: 100,
      applicable: true,
      summary: "",
      problems: [],
      recommendations: [],
    })),
    ...overrides,
  } as RawAnalysisResult;
}

describe("computeReport", () => {
  it("weights sum to 1 across applicable dimensions", () => {
    const report = computeReport({ analysisId: "a", raw: raw(), hasScreenshots: true });
    const total = report.dimensions.reduce((sum, d) => sum + d.weight, 0);
    expect(total).toBeCloseTo(1, 3);
    expect(report.overallScore).toBe(80);
  });

  it("redistributes weight when screenshots are absent", () => {
    const report = computeReport({ analysisId: "a", raw: raw(), hasScreenshots: false });
    const visual = report.dimensions.find((d) => d.dimension === "VISUAL_CONTINUITY")!;
    expect(visual.applicable).toBe(false);
    expect(visual.weight).toBe(0);
    // The remaining eight still average 80 rather than being dragged down.
    expect(report.overallScore).toBe(80);
    expect(report.dimensions.filter((d) => d.applicable).reduce((s, d) => s + d.weight, 0)).toBeCloseTo(1, 3);
  });

  it("caps the overall score when a critical CTA problem exists", () => {
    const dims = raw().dimensions.map((d) =>
      d.dimension === "CTA_MATCH"
        ? { ...d, problems: [{ severity: "CRITICAL" as const, title: "t", detail: "d", evidence: { adQuote: "", pageQuote: "", selector: "" } }] }
        : d,
    );
    const report = computeReport({ analysisId: "a", raw: raw({ dimensions: dims }), hasScreenshots: true });
    expect(report.overallScore).toBeLessThanOrEqual(72);
  });

  it("damps low-confidence dimensions toward the midpoint", () => {
    const dims = raw().dimensions.map((d) => ({ ...d, score: 10, confidence: 0 }));
    const report = computeReport({ analysisId: "a", raw: raw({ dimensions: dims }), hasScreenshots: true });
    // 50 + (10 - 50) * 0.6 = 26, not 10.
    expect(report.overallScore).toBe(26);
  });

  it("excludes large-effort items from quick wins", () => {
    const dims = raw().dimensions.map((d) =>
      d.dimension === "PROOF"
        ? { ...d, recommendations: [
            { priority: "HIGH" as const, effort: "LARGE" as const, impact: 10, title: "rebuild", detail: "", example: "" },
            { priority: "HIGH" as const, effort: "TRIVIAL" as const, impact: 7, title: "add badge", detail: "", example: "" },
          ] }
        : d,
    );
    const report = computeReport({ analysisId: "a", raw: raw({ dimensions: dims }), hasScreenshots: true });
    expect(report.quickWins.map((q) => q.title)).toEqual(["add badge"]);
  });
});
