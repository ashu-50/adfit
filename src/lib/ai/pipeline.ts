import { generateStructured, sumUsage, type Usage } from "./client";
import { geminiAnalysisSchema, analysisResultSchema } from "./schemas";
import { ANALYST_SYSTEM, PROMPT_VERSION } from "./prompts/system";
import { buildAnalysisPrompt } from "./prompts/analysis";
import { parseAdFromImage, parseAdFromText } from "./ocr";
import { clusterAds } from "./clustering";
import { extractLandingPage } from "@/lib/extraction";
import { computeReport } from "@/lib/scoring/engine";
import type { ExtractedPage } from "@/lib/extraction/types";
import type { AdInput } from "@/lib/validation/analysis";
import type { FitReport, ParsedAd } from "@/types/domain";
import { downloadScreenshot } from "@/lib/storage";
import { sha256 } from "@/lib/utils";
import { AppError } from "@/lib/http/errors";
import { logger } from "@/lib/logger";
import pLimit from "p-limit";

export type PipelineStage = "EXTRACTING" | "OCR" | "ANALYZING" | "SCORING";

export type ProgressEvent = {
  stage: PipelineStage;
  progress: number;
  message: string;
  level?: "info" | "warn";
};

export type PipelineInput = {
  analysisId: string;
  userId: string;
  url: string;
  ads: AdInput[];
  forceRefresh?: boolean;
  signal?: AbortSignal;
  onProgress?: (event: ProgressEvent) => void | Promise<void>;
};

export type PipelineOutput = {
  report: FitReport;
  page: ExtractedPage;
  parsedAds: { input: AdInput; parsed: ParsedAd; ocrText?: string; ocrConfidence?: number }[];
  usage: Usage;
  promptVersion: string;
  cacheHits: { extraction: boolean };
};

/**
 * The whole analysis, end to end.
 *
 * Stage order is deliberate: extraction runs first and in parallel with ad
 * parsing, because a dead URL should fail the run before we spend vision tokens
 * on six screenshots. Progress is reported as a fraction of total work rather
 * than per stage so the UI bar moves smoothly instead of jumping.
 */
export async function runAnalysis(input: PipelineInput): Promise<PipelineOutput> {
  const log = logger.child({ analysisId: input.analysisId });
  const report = async (event: ProgressEvent) => { await input.onProgress?.(event); };

  await report({ stage: "EXTRACTING", progress: 5, message: "Opening the landing page" });

  const extractionPromise = extractLandingPage(input.url, {
    forceRefresh: input.forceRefresh,
    signal: input.signal,
    onProgress: (message) => void report({ stage: "EXTRACTING", progress: 12, message }),
  });

  await report({ stage: "OCR", progress: 15, message: `Reading ${input.ads.length} ad${input.ads.length === 1 ? "" : "s"}` });

  // Vision calls are the slowest per-item work, so they run concurrently, but
  // capped: six parallel image uploads will trip the provider's rate limit
  // faster than they will save wall-clock time.
  const limit = pLimit(3);
  let completedAds = 0;

  const adResults = await Promise.all(
    // No index needed: Promise.all resolves in input order regardless of which
    // ad finishes first, so array position stays the ad's identity downstream
    // (clustering refers to ads by index).
    input.ads.map((ad) =>
      limit(async () => {
        try {
          if (ad.type === "text") {
            const { parsed, usage } = await parseAdFromText({
              text: ad.text,
              label: ad.label,
              signal: input.signal,
              skipCache: input.forceRefresh,
            });
            return { input: ad, parsed, usage };
          }

          const { base64, mimeType } = await downloadScreenshot(ad.storagePath);
          const { parsed, ocrText, ocrConfidence, usage } = await parseAdFromImage({
            base64,
            mimeType: mimeType || ad.mimeType,
            label: ad.label,
            signal: input.signal,
            skipCache: input.forceRefresh,
          });
          return { input: ad, parsed, ocrText, ocrConfidence, usage };
        } finally {
          completedAds++;
          await report({
            stage: "OCR",
            progress: 15 + Math.round((completedAds / input.ads.length) * 25),
            message: `Read ${completedAds} of ${input.ads.length} ads`,
          });
        }
      }),
    ),
  );

  const extraction = await extractionPromise;
  const page = extraction.page;

  await report({
    stage: "ANALYZING",
    progress: 45,
    message: extraction.cacheHit ? "Using a recent read of this page" : `Read ${page.wordCount.toLocaleString()} words`,
  });

  if (page.diagnostics.escalationReason) {
    await report({ stage: "ANALYZING", progress: 46, message: page.diagnostics.escalationReason, level: "warn" });
  }

  const parsedAds = adResults.map((r) => r.parsed);
  const hasScreenshots = input.ads.some((a) => a.type === "image");

  await report({ stage: "ANALYZING", progress: 50, message: "Comparing the ads against the page" });

  const prompt = buildAnalysisPrompt({ ads: parsedAds, page, hasScreenshots });
  const promptDigest = await sha256(prompt);

  const [analysis, clustering] = await Promise.all([
    generateStructured({
      operation: "fit-analysis",
      system: ANALYST_SYSTEM,
      parts: [{ text: prompt }],
      responseSchema: geminiAnalysisSchema,
      validator: analysisResultSchema,
      maxOutputTokens: 8192,
      cacheParts: [promptDigest, PROMPT_VERSION],
      skipCache: input.forceRefresh,
      signal: input.signal,
    }),
    clusterAds({ ads: parsedAds, pageUrl: page.finalUrl, signal: input.signal, skipCache: input.forceRefresh }),
  ]);

  await report({ stage: "SCORING", progress: 85, message: "Scoring nine dimensions" });

  const scored = computeReport({ analysisId: input.analysisId, raw: analysis.data, hasScreenshots });

  const usage = sumUsage(
    ...adResults.map((r) => r.usage),
    analysis.usage,
    clustering.usage,
  );

  log.info("analysis complete", {
    score: scored.overallScore,
    grade: scored.grade,
    tokens: usage.inputTokens + usage.outputTokens,
    strategy: page.strategy,
  });

  await report({ stage: "SCORING", progress: 98, message: "Writing the report" });

  return {
    report: { ...scored, clusters: clustering.clusters },
    page,
    parsedAds: adResults.map(({ input: adInput, parsed, ocrText, ocrConfidence }) => ({ input: adInput, parsed, ocrText, ocrConfidence })),
    usage,
    promptVersion: PROMPT_VERSION,
    cacheHits: { extraction: extraction.cacheHit },
  };
}

export function assertPipelineReady() {
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError("AI_UNAVAILABLE", "The analysis service is not configured.");
  }
}
