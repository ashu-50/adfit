import { ThinkingLevel, type ThinkingConfig } from "@google/genai";

/**
 * Everything that changes when Google ships a model generation lives here.
 *
 * The previous design leaked `thinkingBudget: 0` — a Gemini 2.5-only field —
 * into call sites across the pipeline. When Gemini 3 replaced that field with
 * `thinkingLevel`, every one of those calls started returning
 * `400 INVALID_ARGUMENT`, and the fix had to be applied in several places at
 * once. Call sites now declare *intent* ("this is transcription, do not
 * deliberate") and this module translates it for whichever family the model
 * belongs to.
 */

// ---------------------------------------------------------------- model ids

export const GEMINI_MODELS = {
  /** Current GA Flash. Handles the judgement calls: analysis and clustering. */
  flash: "gemini-3.5-flash",
  /** Cheap, fast, multimodal. Transcription and ad parsing. */
  flashLite: "gemini-3.1-flash-lite",
  /** Frontier reasoning. Not used by default; here so overrides are typo-proof. */
  pro: "gemini-3.1-pro-preview",
} as const;

/**
 * Floating aliases resolve to whatever Google currently considers newest, which
 * is convenient until it silently moves you onto a model with different
 * behaviour or a different price. Pin explicit ids in production and treat
 * these as escape hatches.
 */
export const GEMINI_ALIASES = ["gemini-flash-latest", "gemini-pro-latest"] as const;

// ---------------------------------------------------------------- thinking

export type ThinkingEffort = "minimal" | "low" | "medium" | "high";

const LEVEL_BY_EFFORT: Record<ThinkingEffort, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/**
 * Gemini 2.5 fallback. Token budgets are a poor match for four semantic levels,
 * so these are deliberately coarse — the mapping only has to be reasonable for
 * a model family that is on its way out.
 */
const BUDGET_BY_EFFORT: Record<ThinkingEffort, number> = {
  minimal: 0,
  low: 2048,
  medium: 8192,
  high: 24_576,
};

/**
 * Major version from a model id, or null for a floating alias.
 *
 * `gemini-3.5-flash` -> 3, `gemini-2.5-flash` -> 2, `gemini-flash-latest` -> null.
 * Tolerates the fully-qualified `models/gemini-3.5-flash` form the API also accepts.
 */
export function modelGeneration(model: string): number | null {
  const id = model.startsWith("models/") ? model.slice("models/".length) : model;
  const major = /^gemini-(\d+)(?:\.\d+)?-/.exec(id)?.[1];
  return major ? Number(major) : null;
}

/**
 * Gemini 3 and later take `thinkingLevel`; 2.5 takes `thinkingBudget`. Sending
 * the wrong one is a 400, and sending both is also a 400 — they are mutually
 * exclusive, not merely alternatives.
 *
 * Unversioned aliases default to the modern field. Every model Google has
 * shipped since late 2025 is generation 3 or above, so an unrecognised name is
 * far more likely to be newer than older.
 */
export function usesThinkingLevel(model: string): boolean {
  const generation = modelGeneration(model);
  return generation === null || generation >= 3;
}

export function thinkingConfigFor(model: string, effort: ThinkingEffort | undefined): ThinkingConfig | undefined {
  if (effort === undefined) return undefined;
  return usesThinkingLevel(model)
    ? { thinkingLevel: LEVEL_BY_EFFORT[effort] }
    : { thinkingBudget: BUDGET_BY_EFFORT[effort] };
}

// ---------------------------------------------------------------- pricing

export type ModelPrice = { input: number; output: number };

/**
 * US dollars per million tokens, list price, verified July 2026.
 *
 * Worth knowing before you tune anything: 3.5 Flash is roughly five times the
 * input cost of the 2.5 Flash this project was originally written against
 * ($1.50 against $0.30). That is why transcription and ad parsing default to
 * Flash-Lite — they are high-volume, low-judgement steps, and routing them to
 * the cheaper model is the single biggest lever on cost per analysis.
 *
 * These are static and will drift. Override with GEMINI_PRICE_INPUT and
 * GEMINI_PRICE_OUTPUT rather than editing, and check the current numbers at
 * https://ai.google.dev/gemini-api/docs/pricing
 */
const PRICES: Record<string, ModelPrice> = {
  "gemini-3.5-flash": { input: 1.5, output: 9.0 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3-flash": { input: 0.5, output: 3.0 },
  "gemini-3.1-pro": { input: 2.0, output: 12.0 },
  "gemini-3-pro": { input: 2.0, output: 12.0 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
};

/** Anything unrecognised bills at Flash rates: over-estimating a bill is the safer error. */
const FALLBACK_PRICE: ModelPrice = { input: 1.5, output: 9.0 };

export function priceFor(model: string): ModelPrice {
  if (PRICES[model]) return PRICES[model];

  // Dated and preview suffixes ("-preview", "-preview-05-2026") share the base
  // model's price, so match on the longest registered prefix.
  const prefix = Object.keys(PRICES)
    .filter((key) => model.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];

  return prefix ? PRICES[prefix]! : FALLBACK_PRICE;
}
