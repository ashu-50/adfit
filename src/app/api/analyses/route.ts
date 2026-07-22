import { after } from "next/server";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";
import { createAnalysisSchema, listAnalysesSchema } from "@/lib/validation/analysis";
import { listAnalyses } from "@/lib/db/repositories/analysis";
import { createAnalysis, processAnalysis } from "@/lib/services/analysis-service";
import { enforceRateLimit } from "@/lib/cache/rate-limit";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

export const GET = route({ query: listAnalysesSchema }, async ({ user, query }) => {
  const { items, meta } = await listAnalyses(user.id, query);
  return ok(items, { meta });
});

export const POST = route({ body: createAnalysisSchema }, async ({ user, body }) => {
  const perMinute = serverEnv().RATE_LIMIT_ANALYSES_PER_MINUTE;
  await enforceRateLimit(
    `analyses:${user.id}`,
    { capacity: perMinute, refillPerSecond: perMinute / 60 },
    "You are starting analyses faster than we can run them. Give it a minute.",
  );

  const analysis = await createAnalysis({ userId: user.id, plan: user.plan, input: body });

  // `after` runs once the response has been flushed, so the client gets its id
  // immediately while the pipeline keeps running in the same invocation. On a
  // platform with a real queue, this is the line you replace with an enqueue.
  after(async () => {
    try {
      await processAnalysis(analysis.id);
    } catch (err) {
      logger.error("background analysis crashed", { analysisId: analysis.id, err: String(err) });
    }
  });

  return ok({ id: analysis.id, status: "QUEUED" }, { status: 202 });
});
