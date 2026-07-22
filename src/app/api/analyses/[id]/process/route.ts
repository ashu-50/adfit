import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processAnalysis } from "@/lib/services/analysis-service";
import { serverEnv } from "@/lib/env";
import { ok, fail } from "@/lib/http/response";
import { AppError } from "@/lib/http/errors";

export const runtime = "nodejs";
export const maxDuration = 300;

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Internal worker entry point. Not user-facing.
 *
 * `after()` in the create route handles the common case, but this endpoint
 * exists so the pipeline can be driven by a real queue (QStash, Railway cron,
 * a Supabase edge function) without changing any application code. It is
 * guarded by a shared secret compared in constant time.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!secretMatches(provided, serverEnv().WORKER_SECRET)) {
      throw new AppError("FORBIDDEN", "Invalid worker credentials.");
    }

    const { id } = await ctx.params;
    await processAnalysis(id);
    return ok({ processed: true, id });
  } catch (err) {
    return fail(err);
  }
}
