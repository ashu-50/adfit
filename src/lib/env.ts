import { z } from "zod";

/**
 * Fail fast at boot rather than at 3am inside a webhook handler.
 * Client-safe values live in `clientEnv`; everything else is server-only and
 * accessing it from a client bundle throws.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),

  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_STORAGE_BUCKET: z.string().default("ad-screenshots"),

  GEMINI_API_KEY: z
    .string()
    .min(10)
    .refine(
      (v) => v.startsWith("AIza"),
      "GEMINI_API_KEY does not look like a Google AI Studio key (those start with 'AIza'). " +
        "A value starting with 'AQ.' is an OAuth/ADC credential, not an API key — Gemini calls will fail. " +
        "Generate a real key at https://aistudio.google.com/apikey.",
    ),
  /**
   * gemini-2.5-flash is being retired and already 404s for many keys. The two
   * tiers below are the current GA pair: a reasoning model for the scoring and
   * clustering calls, and a cheap one for transcription and ad parsing.
   *
   * Vision is no longer a separate tier — every current model is multimodal —
   * so the old GEMINI_VISION_MODEL is now GEMINI_FAST_MODEL, chosen for price
   * rather than capability. The old name is still read as a fallback so an
   * existing .env.local keeps working.
   */
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  GEMINI_FAST_MODEL: z.string().default("gemini-3.1-flash-lite"),
  GEMINI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  GEMINI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(8192),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  GEMINI_MAX_CONCURRENCY: z.coerce.number().int().positive().default(4),

  RENDERER_URL: z.string().url().optional().or(z.literal("")),
  RENDERER_SECRET: z.string().optional(),
  RENDERER_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),

  WORKER_SECRET: z
    .string()
    .min(24, "WORKER_SECRET must be at least 24 characters — generate one with `openssl rand -hex 32`.")
    .refine(
      (v) => v !== "change-me-in-production",
      "WORKER_SECRET is still the placeholder value. This endpoint has no other authentication — " +
        "anyone who finds it can trigger processing of any analysis id. Generate a real secret " +
        "with `openssl rand -hex 32` before deploying.",
    ),
  ANALYSIS_MAX_DURATION_MS: z.coerce.number().int().positive().default(280_000),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  CACHE_TTL_EXTRACTION_S: z.coerce.number().int().positive().default(86_400),
  CACHE_TTL_LLM_S: z.coerce.number().int().positive().default(604_800),
  RATE_LIMIT_ANALYSES_PER_MINUTE: z.coerce.number().int().positive().default(5),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: z.string().default("ad-screenshots"),
  NEXT_PUBLIC_STRIPE_PRICE_PRO: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE: z.string().optional(),
});

// Next.js inlines process.env.NEXT_PUBLIC_* at build time only for literal
// property access, so these must be written out rather than iterated.
export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
  NEXT_PUBLIC_STRIPE_PRICE_PRO: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO,
  NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE,
});

type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() was called in the browser. Use clientEnv instead.");
  }
  if (cached) return cached;

  const parsed = serverSchema.safeParse({
    ...process.env,
    // GEMINI_VISION_MODEL was renamed to GEMINI_FAST_MODEL when vision stopped
    // being a separate capability tier. Reading both means an existing
    // .env.local keeps working through the rename.
    GEMINI_FAST_MODEL: process.env.GEMINI_FAST_MODEL ?? process.env.GEMINI_VISION_MODEL,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${missing}\n\nCopy .env.example to .env.local and fill it in.`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = process.env.NODE_ENV === "production";