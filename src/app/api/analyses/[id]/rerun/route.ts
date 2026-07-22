import { after } from "next/server";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";
import { prisma } from "@/lib/db/client";
import { notFound } from "@/lib/http/errors";
import { createAnalysis, processAnalysis } from "@/lib/services/analysis-service";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/cache/rate-limit";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Reruns create a new analysis rather than mutating the old one, so the history
 * shows the before and after. That comparison is the whole reason a marketer
 * reruns: "did my headline change actually move the score?"
 */
export const POST = route<undefined, undefined, { id: string }>({}, async ({ user, params }) => {
  const perMinute = serverEnv().RATE_LIMIT_ANALYSES_PER_MINUTE;
  await enforceRateLimit(
    `analyses:${user.id}`,
    { capacity: perMinute, refillPerSecond: perMinute / 60 },
    "You are starting analyses faster than we can run them. Give it a minute.",
  );

  const source = await prisma.analysis.findFirst({
    where: { id: params.id, userId: user.id },
    include: { ads: { orderBy: { position: "asc" } } },
  });
  if (!source) throw notFound("That analysis does not exist, or is not yours.");

  const created = await createAnalysis({
    userId: user.id,
    plan: user.plan,
    input: {
      url: source.targetUrl,
      projectId: source.projectId,
      title: `${source.title} (rerun)`,
      forceRefresh: true,
      ads: source.ads.map((ad) =>
        ad.sourceType === "TEXT"
          ? { type: "text" as const, text: ad.rawText ?? "" }
          : {
              type: "image" as const,
              storagePath: ad.storagePath ?? "",
              mimeType: (ad.mimeType ?? "image/png") as "image/png",
              fileSize: ad.fileSize ?? 1,
            },
      ),
    },
  });

  after(async () => {
    try {
      await processAnalysis(created.id);
    } catch (err) {
      logger.error("background rerun crashed", { analysisId: created.id, err: String(err) });
    }
  });

  return ok({ id: created.id, status: "QUEUED" }, { status: 202 });
});
