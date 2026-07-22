import { GoogleGenAI, type Part, type Schema } from "@google/genai";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { AppError } from "@/lib/http/errors";
import { logger } from "@/lib/logger";
import { sleep } from "@/lib/utils";
import { createSemaphore } from "@/lib/cache/rate-limit";
import { cached } from "@/lib/cache/store";
import { priceFor, thinkingConfigFor, type ThinkingEffort } from "./models";

let client: GoogleGenAI | null = null;
function genai(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: serverEnv().GEMINI_API_KEY });
  return client;
}

let gate: ReturnType<typeof createSemaphore> | null = null;
function semaphore() {
  if (!gate) gate = createSemaphore(serverEnv().GEMINI_MAX_CONCURRENCY);
  return gate;
}

export type Usage = { inputTokens: number; outputTokens: number };

export type GenerateOptions<T> = {
  /** Short label used in logs, cache namespacing and metrics. */
  operation: string;
  system: string;
  parts: Part[];
  responseSchema: Schema;
  /**
   * Input is deliberately `unknown`, not `T`. `z.ZodType<T>` is shorthand for
   * `z.ZodType<T, ZodTypeDef, T>`, which forces the schema's input and output
   * to be the same type — so every schema using `.default()` would infer `T`
   * from its *input* side, where every defaulted field is optional. That is
   * how `headline: string` silently becomes `headline?: string | undefined`
   * for the whole call chain downstream.
   */
  validator: z.ZodType<T, z.ZodTypeDef, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * How hard the model should deliberate, expressed as intent rather than as a
   * provider field. `thinkingBudget` used to be passed here directly; it is a
   * Gemini 2.5-only field and Gemini 3 rejects it outright, so the translation
   * now happens once in ./models instead of at every call site.
   */
  thinking?: ThinkingEffort;
  model?: string;
  maxAttempts?: number;
  /** Cache key inputs. Omit to skip caching entirely. */
  cacheParts?: unknown[];
  cacheTtlSeconds?: number;
  skipCache?: boolean;
  signal?: AbortSignal;
};

export type GenerateResult<T> = { data: T; usage: Usage; cached: boolean; attempts: number };

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function statusOf(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const e = err as { status?: number; code?: number; message?: string };
  if (typeof e.status === "number") return e.status;
  if (typeof e.code === "number") return e.code;
  const match = /\b(4\d\d|5\d\d)\b/.exec(e.message ?? "");
  return match ? Number(match[1]) : null;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const e = err as { message?: string };
    if (typeof e.message === "string") return e.message;
  }
  return String(err);
}

/**
 * Google has changed the thinking field twice in this model family's lifetime,
 * and each change surfaced as an opaque 400 rather than a typed error. When the
 * rejection names the field, the call is retried once with thinking omitted —
 * the model then uses its own default, which is slower or costlier than asked
 * for but still correct. A degraded answer beats a failed analysis.
 */
function isThinkingConfigRejection(err: unknown): boolean {
  if (statusOf(err) !== 400) return false;
  const message = messageOf(err).toLowerCase();
  return message.includes("thinking_budget") || message.includes("thinkinglevel") || message.includes("thinking_level");
}

function backoffMs(attempt: number): number {
  // Full jitter. Prevents the thundering herd when a whole batch hits a 429.
  const base = Math.min(16_000, 500 * 2 ** attempt);
  return Math.round(Math.random() * base);
}

/** Gemini occasionally wraps JSON in a fenced block despite the mime type. */
function stripFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
}

async function callOnce<T>(
  opts: GenerateOptions<T>,
  repairNote?: string,
  dropThinking = false,
): Promise<{ data: T; usage: Usage }> {
  const env = serverEnv();
  const model = opts.model ?? env.GEMINI_MODEL;

  const timeout = AbortSignal.timeout(env.GEMINI_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  const parts: Part[] = repairNote
    ? [...opts.parts, { text: `\n\nYour previous reply was rejected: ${repairNote}\nReturn corrected JSON only.` }]
    : opts.parts;

  const thinkingConfig = dropThinking ? undefined : thinkingConfigFor(model, opts.thinking);

  const response = await genai().models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: opts.system,
      /**
       * Sampling controls are accepted by Gemini 3.x but no longer influence
       * output — Google's guidance is to constrain format through the system
       * instruction and the response schema instead, which this pipeline
       * already does. Kept so the 2.5 models still honour it.
       */
      temperature: opts.temperature ?? env.GEMINI_TEMPERATURE,
      maxOutputTokens: opts.maxOutputTokens ?? env.GEMINI_MAX_OUTPUT_TOKENS,
      // Structured output, unchanged: the OpenAPI-subset schema is still
      // enforced during decoding, and the Zod validator below still checks the
      // semantics the schema cannot express.
      responseMimeType: "application/json",
      responseSchema: opts.responseSchema,
      ...(thinkingConfig ? { thinkingConfig } : {}),
      abortSignal: signal,
    },
  });

  const usage: Usage = {
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    // Thinking tokens are billed as output but reported separately, so a report
    // that ignores them under-counts the bill on every reasoning model.
    outputTokens:
      (response.usageMetadata?.candidatesTokenCount ?? 0) + (response.usageMetadata?.thoughtsTokenCount ?? 0),
  };

  const text = response.text;
  if (!text) {
    const reason = response.candidates?.[0]?.finishReason ?? "EMPTY";
    // MAX_TOKENS means the schema is too big for the budget, not a transient fault.
    throw new AppError("AI_INVALID_OUTPUT", `The model returned nothing (${reason}).`, {
      retryable: reason !== "MAX_TOKENS",
      details: { finishReason: reason },
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch (err) {
    throw new AppError("AI_INVALID_OUTPUT", "The model returned malformed JSON.", { cause: err, retryable: true });
  }

  const validated = opts.validator.safeParse(parsed);
  if (!validated.success) {
    const issues = validated.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new AppError("AI_INVALID_OUTPUT", `The model's reply failed validation (${issues}).`, {
      retryable: true,
      details: { issues },
    });
  }

  return { data: validated.data, usage };
}

/**
 * One call site for every Gemini request. Handles, in order:
 *   cache lookup -> concurrency gate -> attempt loop with backoff ->
 *   schema-repair retry -> usage accounting.
 *
 * Repair retries differ from transport retries: a malformed reply is fed the
 * validation error so the next attempt has something to correct, whereas a 503
 * is retried verbatim.
 */
export async function generateStructured<T>(opts: GenerateOptions<T>): Promise<GenerateResult<T>> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const log = logger.child({ operation: opts.operation });

  const run = async (): Promise<{ data: T; usage: Usage; attempts: number }> => {
    let lastError: unknown;
    let repairNote: string | undefined;
    let dropThinking = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await semaphore()(() => callOnce(opts, repairNote, dropThinking));
        if (attempt > 0) log.info("recovered after retry", { attempt });
        return { ...result, attempts: attempt + 1 };
      } catch (err) {
        lastError = err;

        // Not retryable in the usual sense — the request itself is malformed
        // for this model — but re-sending it without the offending field is a
        // real fix, so it gets one immediate attempt with no backoff.
        if (isThinkingConfigRejection(err) && !dropThinking) {
          dropThinking = true;
          log.warn("model rejected the thinking config; retrying without it", {
            model: opts.model ?? serverEnv().GEMINI_MODEL,
            err: messageOf(err),
          });
          continue;
        }

        const status = statusOf(err);
        const isAppError = err instanceof AppError;
        const retryable = isAppError ? err.retryable : status !== null && RETRYABLE_STATUS.has(status);

        if (!retryable || attempt === maxAttempts - 1) break;

        if (isAppError && err.code === "AI_INVALID_OUTPUT") {
          repairNote = (err.details as { issues?: string } | undefined)?.issues ?? err.message;
        }

        const wait = backoffMs(attempt);
        log.warn("gemini call failed, retrying", { attempt, status, wait, err: String(err) });
        await sleep(wait, opts.signal);
      }
    }

    if (lastError instanceof AppError) throw lastError;
    const status = statusOf(lastError);

    // A 400 that survives the thinking-config fallback is a request the model
    // will never accept. Saying so beats reporting it as a provider outage and
    // sending the caller to look at a status page.
    if (status === 400) {
      throw new AppError("AI_INVALID_OUTPUT", `The AI provider rejected the request: ${messageOf(lastError)}`, {
        cause: lastError,
        retryable: false,
      });
    }

    throw new AppError(
      status === 429 ? "RATE_LIMITED" : "AI_UNAVAILABLE",
      status === 429 ? "The AI provider is rate limiting us. Try again shortly." : "The AI provider is unavailable right now.",
      { cause: lastError },
    );
  };

  if (!opts.cacheParts) {
    const { data, usage, attempts } = await run();
    return { data, usage, cached: false, attempts };
  }

  const { value, hit } = await cached(
    `gemini:${opts.operation}`,
    [opts.model ?? serverEnv().GEMINI_MODEL, opts.system, opts.cacheParts],
    opts.cacheTtlSeconds ?? serverEnv().CACHE_TTL_LLM_S,
    run,
    { skip: opts.skipCache },
  );

  return { data: value.data, usage: hit ? { inputTokens: 0, outputTokens: 0 } : value.usage, cached: hit, attempts: value.attempts };
}

/**
 * Streams plain text. Used only for the live "what the model is thinking"
 * ticker on the analysis screen — never for anything that must be parsed,
 * because a stream cannot be schema-validated until it completes.
 */
export async function* streamText(system: string, prompt: string, signal?: AbortSignal): AsyncGenerator<string> {
  const env = serverEnv();
  const stream = await genai().models.generateContentStream({
    model: env.GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { systemInstruction: system, temperature: env.GEMINI_TEMPERATURE, abortSignal: signal },
  });
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}

/**
 * Cost in integer micro-dollars.
 *
 * Takes the model because prices now differ by nearly an order of magnitude
 * across the family — billing an ad-parse done on Flash-Lite at Flash rates
 * would overstate it sixfold. Defaults to the configured model so existing
 * call sites keep working.
 */
export function costMicros(usage: Usage, model?: string): number {
  const price = priceFor(model ?? serverEnv().GEMINI_MODEL);
  const dollars = (usage.inputTokens / 1e6) * price.input + (usage.outputTokens / 1e6) * price.output;
  return Math.round(dollars * 1e6);
}

export function sumUsage(...usages: Usage[]): Usage {
  return usages.reduce<Usage>(
    (acc, u) => ({ inputTokens: acc.inputTokens + u.inputTokens, outputTokens: acc.outputTokens + u.outputTokens }),
    { inputTokens: 0, outputTokens: 0 },
  );
}
