import type { Part } from "@google/genai";
import { generateStructured, type Usage } from "./client";
import { geminiOcrSchema, ocrResultSchema, geminiAdSchema, parsedAdSchema } from "./schemas";
import { OCR_SYSTEM, AD_PARSER_SYSTEM } from "./prompts/system";
import { buildAdParsePrompt } from "./prompts/analysis";
import { serverEnv } from "@/lib/env";
import { sha256, normalizeText } from "@/lib/utils";
import { AppError } from "@/lib/http/errors";
import type { ParsedAd } from "@/types/domain";
import { logger } from "@/lib/logger";

export type OcrOutcome = {
  text: string;
  confidence: number;
  isAdvertisement: boolean;
  usage: Usage;
  cached: boolean;
};

/**
 * Gemini Vision replaces a separate OCR engine here for one reason: an ad
 * screenshot is not a document. Tesseract reads glyphs but loses which line was
 * the headline and which was the button; a vision model preserves that ordering
 * because it sees the layout. We pay for one model instead of maintaining two.
 *
 * Thinking is set to minimal — transcription needs no deliberation, and
 * reasoning tokens bill as output, which would double the cost of the cheapest
 * step in the pipeline. This used to be `thinkingBudget: 0`, a Gemini 2.5-only
 * field that Gemini 3 rejects with a 400; the effort is now declared as intent
 * and translated per model family in ./models.
 */
export async function ocrImage(args: {
  base64: string;
  mimeType: string;
  signal?: AbortSignal;
  skipCache?: boolean;
}): Promise<OcrOutcome> {
  const env = serverEnv();
  const digest = await sha256(args.base64.slice(0, 4096) + args.base64.length);

  const parts: Part[] = [
    { inlineData: { mimeType: args.mimeType, data: args.base64 } },
    { text: "Transcribe every readable word in this advertisement." },
  ];

  const result = await generateStructured({
    operation: "ocr",
    system: OCR_SYSTEM,
    parts,
    responseSchema: geminiOcrSchema,
    validator: ocrResultSchema,
    thinking: "minimal",
    maxOutputTokens: 4096,
    model: env.GEMINI_FAST_MODEL,
    cacheParts: [digest, args.mimeType],
    cacheTtlSeconds: env.CACHE_TTL_LLM_S,
    skipCache: args.skipCache,
    signal: args.signal,
  });

  return {
    text: normalizeText(result.data.text).length > 0 ? result.data.text.trim() : "",
    confidence: result.data.confidence,
    isAdvertisement: result.data.isAdvertisement,
    usage: result.usage,
    cached: result.cached,
  };
}

/**
 * Screenshots are parsed in a single vision call rather than OCR-then-parse.
 * Keeping the image in context lets the model attribute colours and layout,
 * which the text-only path cannot recover. The transcript is still returned so
 * the report can show what was read.
 */
export async function parseAdFromImage(args: {
  base64: string;
  mimeType: string;
  label?: string;
  signal?: AbortSignal;
  skipCache?: boolean;
}): Promise<{ parsed: ParsedAd; ocrText: string; ocrConfidence: number; usage: Usage }> {
  const ocr = await ocrImage(args);

  if (!ocr.text) {
    throw new AppError("EXTRACTION_EMPTY", "No readable text was found in that screenshot. Try a higher-resolution image or paste the copy instead.");
  }
  if (!ocr.isAdvertisement) {
    logger.warn("uploaded image did not look like an ad", { confidence: ocr.confidence });
  }

  const digest = await sha256(args.base64.slice(0, 4096) + args.base64.length + (args.label ?? ""));

  const parsed = await generateStructured({
    operation: "parse-ad-image",
    system: AD_PARSER_SYSTEM,
    parts: [
      { inlineData: { mimeType: args.mimeType, data: args.base64 } },
      { text: buildAdParsePrompt({ text: ocr.text, label: args.label, fromImage: true }) },
    ],
    responseSchema: geminiAdSchema,
    validator: parsedAdSchema,
    // Low rather than minimal: attributing a colour or a layout role to the
    // right element is a judgement, unlike transcription.
    thinking: "low",
    maxOutputTokens: 2048,
    model: serverEnv().GEMINI_FAST_MODEL,
    cacheParts: [digest],
    skipCache: args.skipCache,
    signal: args.signal,
  });

  return {
    parsed: parsed.data,
    ocrText: ocr.text,
    ocrConfidence: ocr.confidence,
    usage: { inputTokens: ocr.usage.inputTokens + parsed.usage.inputTokens, outputTokens: ocr.usage.outputTokens + parsed.usage.outputTokens },
  };
}

export async function parseAdFromText(args: {
  text: string;
  label?: string;
  signal?: AbortSignal;
  skipCache?: boolean;
}): Promise<{ parsed: ParsedAd; usage: Usage }> {
  const digest = await sha256(args.text + (args.label ?? ""));

  const result = await generateStructured({
    operation: "parse-ad-text",
    system: AD_PARSER_SYSTEM,
    parts: [{ text: buildAdParsePrompt({ text: args.text, label: args.label, fromImage: false }) }],
    responseSchema: geminiAdSchema,
    validator: parsedAdSchema,
    maxOutputTokens: 2048,
    thinking: "minimal",
    // Structuring copy that is already text is the cheapest call in the
    // pipeline; it does not need the model that does the scoring.
    model: serverEnv().GEMINI_FAST_MODEL,
    cacheParts: [digest],
    skipCache: args.skipCache,
    signal: args.signal,
  });

  return { parsed: result.data, usage: result.usage };
}
