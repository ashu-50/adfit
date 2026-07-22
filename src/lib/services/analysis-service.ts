import { prisma } from "@/lib/db/client";
import { runAnalysis, type ProgressEvent } from "@/lib/ai/pipeline";
import { markFailed, updateProgress } from "@/lib/db/repositories/analysis";
import { recordTokenUsage, releaseQuota, reserveAnalysisQuota } from "@/lib/billing/entitlements";
import { costMicros } from "@/lib/ai/client";
import { toAppError } from "@/lib/http/errors";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { hostnameOf, sha256, truncate } from "@/lib/utils";
import type { CreateAnalysisInput } from "@/lib/validation/analysis";
import type { AdAngle, Dimension, Plan } from "@prisma/client";
import type { DimensionKey } from "@/types/domain";

/**
 * Creates the row and returns immediately. The pipeline is not awaited here,
 * because a full run takes 20-60s and no serverless HTTP request should stay
 * open that long. The client gets an id and subscribes to progress.
 */
export async function createAnalysis(args: { userId: string; plan: Plan; input: CreateAnalysisInput }) {
  await reserveAnalysisQuota(args.userId, args.plan, args.input.ads.length);

  try {
    if (args.input.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: args.input.projectId, userId: args.userId },
        select: { id: true },
      });
      if (!project) throw new Error("PROJECT_NOT_FOUND");
    }

    const analysis = await prisma.analysis.create({
      data: {
        userId: args.userId,
        projectId: args.input.projectId ?? null,
        title: args.input.title?.trim() || `${hostnameOf(args.input.url)} — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
        targetUrl: args.input.url,
        urlHash: await sha256(args.input.url),
        status: "QUEUED",
        progress: 0,
        stage: "Queued",
        ads: {
          create: args.input.ads.map((ad, position) => ({
            position,
            sourceType: ad.type === "text" ? "TEXT" : "IMAGE",
            rawText: ad.type === "text" ? ad.text : null,
            storagePath: ad.type === "image" ? ad.storagePath : null,
            mimeType: ad.type === "image" ? ad.mimeType : null,
            fileSize: ad.type === "image" ? ad.fileSize : null,
          })),
        },
      },
      select: { id: true },
    });

    return analysis;
  } catch (err) {
    await releaseQuota(args.userId, args.input.ads.length);
    throw err;
  }
}

/**
 * Executes the pipeline and persists everything in one transaction at the end.
 *
 * Progress events are written outside that transaction so the UI sees movement
 * while the work is happening; the report itself lands atomically so a partial
 * write can never be read as a finished analysis.
 */
export async function processAnalysis(analysisId: string): Promise<void> {
  const log = logger.child({ analysisId });
  const started = Date.now();

  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    include: { ads: { orderBy: { position: "asc" } } },
  });

  if (!analysis) return log.warn("analysis vanished before processing");
  if (analysis.status !== "QUEUED") return log.info("analysis already processed", { status: analysis.status });

  const controller = new AbortController();
  const budget = setTimeout(() => controller.abort(), serverEnv().ANALYSIS_MAX_DURATION_MS);

  const onProgress = async (event: ProgressEvent) => {
    await updateProgress(analysisId, {
      status: event.stage,
      progress: event.progress,
      stage: event.stage,
      message: event.message,
      level: event.level,
    }).catch(() => {});
  };

  try {
    await updateProgress(analysisId, { status: "EXTRACTING", progress: 2, stage: "EXTRACTING", message: "Starting" });

    const result = await runAnalysis({
      analysisId,
      userId: analysis.userId,
      url: analysis.targetUrl,
      ads: analysis.ads.map((ad) =>
        ad.sourceType === "TEXT"
          ? { type: "text" as const, text: ad.rawText ?? "" }
          : {
              type: "image" as const,
              storagePath: ad.storagePath ?? "",
              mimeType: (ad.mimeType ?? "image/png") as "image/png",
              fileSize: ad.fileSize ?? 0,
            },
      ),
      signal: controller.signal,
      onProgress,
    });

    await persistResult({ analysis, result, durationMs: Date.now() - started });
    await recordTokenUsage(analysis.userId, result.usage.inputTokens, result.usage.outputTokens);

    log.info("analysis persisted", { score: result.report.overallScore, ms: Date.now() - started });
  } catch (err) {
    const appError = toAppError(err);

    // The stack goes through the logger rather than a bare console banner, so
    // it carries the analysisId and survives in production log aggregation.
    log.error("analysis failed", {
      code: appError.code,
      message: appError.message,
      stack: err instanceof Error ? err.stack : String(err),
    });

    await markFailed(analysisId, appError.message, appError.code).catch(() => {});
    // A run the user did not get value from should not consume their quota.
    await releaseQuota(analysis.userId, analysis.ads.length).catch(() => {});
  } finally {
    // Without this the abort timer stays armed for the full duration budget
    // after a fast analysis has already finished, holding the event loop open
    // and firing into a controller nobody is listening to.
    clearTimeout(budget);
  }
}

async function persistResult(args: {
  analysis: { id: string; userId: string };
  result: Awaited<ReturnType<typeof runAnalysis>>;
  durationMs: number;
}) {
  const { analysis, result, durationMs } = args;
  const { report, page, parsedAds, usage } = result;

  await prisma.$transaction(async (tx) => {
    await tx.landingPage.upsert({
      where: { analysisId: analysis.id },
      create: {
        analysisId: analysis.id,
        url: page.url,
        finalUrl: page.finalUrl,
        httpStatus: page.httpStatus,
        strategy: page.strategy,
        contentHash: page.contentHash,
        fetchDurationMs: page.fetchDurationMs,
        title: page.meta.title || null,
        description: page.meta.description || null,
        lang: page.meta.lang,
        canonical: page.meta.canonical,
        favicon: page.meta.favicon,
        ogImage: page.meta.ogImage,
        extracted: page as unknown as object,
        readableText: truncate(page.readableText, 50_000),
        wordCount: page.wordCount,
      },
      update: { extracted: page as unknown as object, contentHash: page.contentHash },
    });

    // Clusters must exist before ads can point at them.
    const clusterIds = new Map<number, string>();
    for (const cluster of report.clusters) {
      const created = await tx.adCluster.create({
        data: {
          analysisId: analysis.id,
          angle: cluster.angle as AdAngle,
          label: cluster.label,
          rationale: cluster.rationale,
          blueprint: cluster.blueprint as unknown as object,
        },
        select: { id: true },
      });
      for (const index of cluster.adIndexes) clusterIds.set(index, created.id);
    }

    const existingAds = await tx.ad.findMany({
      where: { analysisId: analysis.id },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });

    for (const [index, entry] of parsedAds.entries()) {
      const row = existingAds[index];
      if (!row) continue;
      await tx.ad.update({
        where: { id: row.id },
        data: {
          clusterId: clusterIds.get(index) ?? null,
          ocrText: entry.ocrText ?? null,
          ocrConfidence: entry.ocrConfidence ?? null,
          parsed: entry.parsed as unknown as object,
          angle: entry.parsed.angle as AdAngle,
        },
      });
    }

    const created = await tx.report.upsert({
      where: { analysisId: analysis.id },
      create: {
        analysisId: analysis.id,
        overallScore: report.overallScore,
        grade: report.grade,
        confidence: report.confidence,
        summary: report.summary,
        verdict: report.verdict,
        strengths: report.strengths,
        weaknesses: report.weaknesses,
        criticalIssues: report.criticalIssues as unknown as object,
        quickWins: report.quickWins as unknown as object,
        rewrites: report.rewrites as unknown as object,
      },
      update: {
        overallScore: report.overallScore,
        grade: report.grade,
        summary: report.summary,
        verdict: report.verdict,
      },
      select: { id: true },
    });

    await tx.dimensionScore.deleteMany({ where: { reportId: created.id } });
    await tx.dimensionScore.createMany({
      data: report.dimensions.map((d) => ({
        reportId: created.id,
        dimension: d.dimension as Dimension,
        score: d.score,
        weight: d.weight,
        weightedScore: d.weightedScore,
        confidence: d.confidence,
        applicable: d.applicable,
        summary: d.summary,
        problems: d.problems as unknown as object,
        recommendations: d.recommendations as unknown as object,
      })),
    });

    await tx.analysis.update({
      where: { id: analysis.id },
      data: {
        status: "COMPLETED",
        progress: 100,
        stage: "COMPLETED",
        overallScore: report.overallScore,
        grade: report.grade,
        promptVersion: result.promptVersion,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsdMicros: costMicros(usage),
        durationMs,
        completedAt: new Date(),
        error: null,
        errorCode: null,
      },
    });
  }, { timeout: 20_000 });
}

export const DIMENSION_TO_DB: Record<DimensionKey, Dimension> = {
  PERSONA_MATCH: "PERSONA_MATCH",
  OFFER_MATCH: "OFFER_MATCH",
  MESSAGE_MATCH: "MESSAGE_MATCH",
  PRODUCT_FRAMING: "PRODUCT_FRAMING",
  PROOF: "PROOF",
  OBJECTIONS: "OBJECTIONS",
  CTA_MATCH: "CTA_MATCH",
  ABOVE_FOLD: "ABOVE_FOLD",
  VISUAL_CONTINUITY: "VISUAL_CONTINUITY",
};
