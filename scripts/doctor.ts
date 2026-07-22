/**
 * Preflight check for a fresh backend.
 *
 *   pnpm doctor
 *
 * Answers one question — what is stopping this from running — instead of making
 * you discover it one 500 at a time. Every failure prints the fix, not just the
 * symptom. Safe to run repeatedly; it only reads.
 */
import { PrismaClient } from "@prisma/client";
import { loadEnvFile } from "./lib/env-file";

const env = loadEnvFile();

type Status = "pass" | "warn" | "fail" | "skip";
type Check = { name: string; status: Status; detail: string; fix?: string };

const results: Check[] = [];
const record = (name: string, status: Status, detail: string, fix?: string) =>
  results.push({ name, status, detail, ...(fix ? { fix } : {}) });

// ------------------------------------------------------------------ env

type Spec = { key: string; required: boolean; hint: string; check?: (v: string) => string | null };

const SPECS: Spec[] = [
  { key: "DATABASE_URL", required: true, hint: "Supabase → Settings → Database → Connection string (pooled, 6543)",
    check: (v) => (v.includes("6543") && !v.includes("pgbouncer=true")
      ? "Pooled URL is missing ?pgbouncer=true&connection_limit=1 — Prisma will exhaust connections"
      : null) },
  { key: "DIRECT_URL", required: false, hint: "Same page, direct connection (5432). Needed for migrations and rls.sql" },
  { key: "NEXT_PUBLIC_SUPABASE_URL", required: true, hint: "Supabase → Settings → API → Project URL",
    check: (v) => (v.startsWith("https://") ? null : "Should start with https://") },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true, hint: "Supabase → Settings → API → anon public key",
    check: (v) => (v.length < 20 ? "Looks truncated" : null) },
  { key: "SUPABASE_SERVICE_ROLE_KEY", required: true, hint: "Supabase → Settings → API → service_role key (server only)",
    check: (v) => (v.length < 20 ? "Looks truncated" : null) },
  { key: "NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET", required: false, hint: "Defaults to ad-screenshots" },
  { key: "GEMINI_API_KEY", required: true, hint: "https://aistudio.google.com/apikey",
    check: (v) => (v.length < 20 ? "Looks truncated" : null) },
  { key: "WORKER_SECRET", required: true, hint: "Any random string — guards the internal process route",
    check: (v) => (v.length < 8 ? "Use at least 8 characters" : v.includes("change-me") ? "Still the placeholder" : null) },
  { key: "NEXT_PUBLIC_APP_URL", required: false, hint: "http://localhost:3000 in development" },
  { key: "RENDERER_URL", required: false, hint: "Optional. Blank means static-only extraction" },
  { key: "STRIPE_SECRET_KEY", required: false, hint: "Optional. Blank keeps everyone on the free plan" },
];

function checkEnv(): boolean {
  let fatal = false;

  for (const spec of SPECS) {
    const value = process.env[spec.key];

    if (!value) {
      if (spec.required) {
        record(spec.key, "fail", "missing", spec.hint);
        fatal = true;
      } else {
        record(spec.key, "skip", "not set", spec.hint);
      }
      continue;
    }

    // Placeholder values copied straight out of .env.example.
    const isPlaceholder =
      /^(AIza\.\.\.|sk_test_\.\.\.|sk_live_\.\.\.|whsec_\.\.\.|price_\.\.\.|eyJhbGciOi\.\.\.)$/.test(value) ||
      value.includes("PROJECT:PASSWORD") ||
      value.includes("PROJECT.supabase.co") ||
      value.includes("change-me-in-production");

    if (isPlaceholder) {
      if (spec.required) {
        record(spec.key, "fail", "still the example placeholder", spec.hint);
        fatal = true;
      } else {
        // An optional key left as its placeholder just means "not configured",
        // which is a legitimate state — Stripe being unset keeps everyone free.
        record(spec.key, "skip", "not configured", spec.hint);
      }
      continue;
    }

    const problem = spec.check?.(value);
    if (problem) {
      record(spec.key, "warn", problem, spec.hint);
      continue;
    }

    record(spec.key, "pass", "set", undefined);
  }

  return !fatal;
}

// ------------------------------------------------------------------ database

async function checkDatabase(): Promise<void> {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) return;

  const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    record("Database connection", "pass", "reachable");
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n").find((l) => l.trim()) ?? "" : String(error);
    record("Database connection", "fail", message.slice(0, 120),
      "Check the password in the connection string, and that your IP is allowed.");
    await prisma.$disconnect();
    return;
  }

  try {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = new Set(tables.map((t) => t.table_name));
    const expected = ["users", "projects", "analyses", "ads", "reports", "dimension_scores", "usage_records"];
    const missing = expected.filter((t) => !names.has(t));

    if (missing.length === expected.length) {
      record("Schema", "fail", "no tables found", "Run: pnpm db:migrate:dev --name init");
    } else if (missing.length > 0) {
      record("Schema", "fail", `missing ${missing.join(", ")}`, "Run: pnpm db:migrate:dev");
    } else {
      record("Schema", "pass", `${names.size} tables`);
    }

    if (missing.length === 0) {
      const [trigger] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT count(*)::bigint AS count FROM pg_trigger WHERE tgname = 'on_auth_user_created'`,
      );
      const [policies] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT count(*)::bigint AS count FROM pg_policies WHERE schemaname = 'public'`,
      );

      const hasTrigger = Number(trigger?.count ?? 0) > 0;
      const policyCount = Number(policies?.count ?? 0);

      if (!hasTrigger) {
        record("Signup trigger", "fail", "on_auth_user_created is missing",
          "Run: pnpm db:rls — without it every new signup fails on its first request.");
      } else {
        record("Signup trigger", "pass", "installed");
      }

      record(
        "RLS policies",
        policyCount > 0 ? "pass" : "warn",
        `${policyCount} policies`,
        policyCount > 0 ? undefined : "Run: pnpm db:rls",
      );

      const users = await prisma.user.count();
      const analyses = await prisma.analysis.count();
      record("Data", "pass", `${users} users, ${analyses} analyses`);
    }
  } catch (error) {
    record("Schema", "warn", error instanceof Error ? error.message.slice(0, 120) : String(error));
  } finally {
    await prisma.$disconnect();
  }
}

// ------------------------------------------------------------------ supabase

async function checkSupabase(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  const bucketName = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || process.env.SUPABASE_STORAGE_BUCKET || "ad-screenshots";

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/storage/v1/bucket`, {
      headers: { authorization: `Bearer ${key}`, apikey: key },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 401 || res.status === 403) {
      record("Supabase Storage", "fail", `rejected the service role key (${res.status})`,
        "Copy the service_role key again — the anon key will not work here.");
      return;
    }
    if (!res.ok) {
      record("Supabase Storage", "warn", `responded ${res.status}`);
      return;
    }

    const buckets = (await res.json()) as { name: string; public: boolean }[];
    const bucket = buckets.find((b) => b.name === bucketName);

    if (!bucket) {
      record("Supabase Storage", "fail", `no bucket named "${bucketName}"`,
        `Create a PRIVATE bucket called ${bucketName} in Supabase → Storage.`);
    } else if (bucket.public) {
      record("Supabase Storage", "warn", `"${bucketName}" is public`,
        "Make it private. Uploads are authorised with signed URLs, so public access only leaks screenshots.");
    } else {
      record("Supabase Storage", "pass", `"${bucketName}" is private`);
    }
  } catch (error) {
    record("Supabase Storage", "fail", error instanceof Error ? error.message.slice(0, 100) : String(error),
      "Check NEXT_PUBLIC_SUPABASE_URL is the project URL.");
  }
}

// ------------------------------------------------------------------ gemini

async function checkGemini(): Promise<void> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 400 || res.status === 403) {
      record("Gemini", "fail", `key rejected (${res.status})`, "Create a key at https://aistudio.google.com/apikey");
      return;
    }
    if (!res.ok) {
      record("Gemini", "warn", `responded ${res.status}`);
      return;
    }

    const body = (await res.json()) as { models?: { name: string }[] };
    const wanted = process.env.GEMINI_MODEL || "gemini-3.5-flash";
    const available = (body.models ?? []).some((m) => m.name.includes(wanted));

    if (available) {
      record("Gemini", "pass", `${wanted} available`);
    } else {
      // Retired models keep appearing in ListModels for a while after they stop
      // serving traffic, so absence here is a strong signal but presence is not
      // a guarantee. gemini-2.5-* is on its way out and already 404s for many keys.
      const retired = /gemini-2\./.test(wanted);
      record(
        "Gemini",
        "fail",
        `${wanted} is not in the model list`,
        retired
          ? "That model is being retired. Set GEMINI_MODEL=gemini-3.5-flash."
          : "Check the spelling of GEMINI_MODEL, or unset it to use the default.",
      );
    }
  } catch (error) {
    record("Gemini", "fail", error instanceof Error ? error.message.slice(0, 100) : String(error));
  }
}

// ------------------------------------------------------------------ renderer

async function checkRenderer(): Promise<void> {
  const url = process.env.RENDERER_URL;
  if (!url) {
    record("Renderer", "skip", "not configured",
      "Optional. Without it, JavaScript-rendered pages come back thin instead of failing.");
    return;
  }

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(5000) });
    record("Renderer", res.ok ? "pass" : "warn", res.ok ? "healthy" : `responded ${res.status}`);
  } catch {
    record("Renderer", "warn", "unreachable",
      "Start it with: cd services/renderer && npm run dev — or clear RENDERER_URL to run static-only.");
  }
}

// ------------------------------------------------------------------ report

const ICON: Record<Status, string> = { pass: "  ok  ", warn: " warn ", fail: " FAIL ", skip: " skip " };

async function main() {
  console.log("\n  adfit preflight\n  " + "-".repeat(64));

  if (!env.loaded) {
    console.log(`\n  No .env.local found at ${env.path}`);
    console.log("  Copy .env.example to .env.local and fill it in first.\n");
    process.exit(1);
  }
  console.log(`  Loaded ${env.count} values from .env.local\n`);

  const envOk = checkEnv();

  if (envOk) {
    await Promise.all([checkDatabase(), checkSupabase(), checkGemini(), checkRenderer()]);
  } else {
    console.log("  Skipping connectivity checks until the required values are set.\n");
  }

  const width = Math.max(...results.map((r) => r.name.length));
  let lastFix = false;

  for (const result of results) {
    if (lastFix) console.log("");
    console.log(`  [${ICON[result.status]}] ${result.name.padEnd(width)}  ${result.detail}`);
    lastFix = Boolean(result.fix && result.status !== "pass");
    if (lastFix) console.log(`  ${" ".repeat(width + 10)}${result.fix}`);
  }

  const failures = results.filter((r) => r.status === "fail").length;
  const warnings = results.filter((r) => r.status === "warn").length;

  console.log("\n  " + "-".repeat(64));
  if (failures > 0) {
    console.log(`  ${failures} blocking ${failures === 1 ? "problem" : "problems"}, ${warnings} warning${warnings === 1 ? "" : "s"}.\n`);
    process.exit(1);
  }
  console.log(`  Ready. ${warnings} warning${warnings === 1 ? "" : "s"}.`);
  console.log("  Next: pnpm db:seed  then  pnpm dev\n");
}

void main();
