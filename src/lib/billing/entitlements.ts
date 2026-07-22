import { prisma } from "@/lib/db/client";
import { PLANS } from "./plans";
import { quotaExceeded, forbidden } from "@/lib/http/errors";
import type { Plan } from "@prisma/client";

/** First of the current month, UTC. The billing period key. */
export function currentPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type UsageSnapshot = {
  plan: Plan;
  periodStart: Date;
  analysesRun: number;
  analysesLimit: number;
  analysesRemaining: number;
  adsProcessed: number;
  inputTokens: number;
  outputTokens: number;
  resetsAt: Date;
};

export async function getUsage(userId: string, plan: Plan): Promise<UsageSnapshot> {
  const periodStart = currentPeriodStart();
  const record = await prisma.usageRecord.findUnique({ where: { userId_periodStart: { userId, periodStart } } });

  const limit = PLANS[plan].limits.analysesPerMonth;
  const used = record?.analysesRun ?? 0;

  return {
    plan,
    periodStart,
    analysesRun: used,
    analysesLimit: limit,
    analysesRemaining: Math.max(0, limit - used),
    adsProcessed: record?.adsProcessed ?? 0,
    inputTokens: record?.inputTokens ?? 0,
    outputTokens: record?.outputTokens ?? 0,
    resetsAt: new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1)),
  };
}

/**
 * Reserves quota before the work starts, not after.
 *
 * The increment and the limit check happen in one statement so two concurrent
 * requests cannot both see "4 of 5 used" and both proceed. If the pipeline then
 * fails, `releaseQuota` gives the slot back — a failed analysis should not cost
 * the user a run.
 */
export async function reserveAnalysisQuota(userId: string, plan: Plan, adCount: number): Promise<void> {
  const definition = PLANS[plan];

  if (adCount > definition.limits.adsPerAnalysis) {
    throw quotaExceeded(
      `The ${definition.name} plan allows ${definition.limits.adsPerAnalysis} ads per analysis. Upgrade or remove ${adCount - definition.limits.adsPerAnalysis}.`,
      { plan, limit: definition.limits.adsPerAnalysis, requested: adCount },
    );
  }

  const periodStart = currentPeriodStart();
  const limit = definition.limits.analysesPerMonth;

  const rows = await prisma.$queryRaw<{ analyses_run: number }[]>`
    INSERT INTO usage_records (id, user_id, period_start, analyses_run, ads_processed, input_tokens, output_tokens, updated_at)
    VALUES (gen_random_uuid(), ${userId}::uuid, ${periodStart}::date, 1, ${adCount}, 0, 0, now())
    ON CONFLICT (user_id, period_start) DO UPDATE SET
      analyses_run  = usage_records.analyses_run + 1,
      ads_processed = usage_records.ads_processed + ${adCount},
      updated_at    = now()
    WHERE usage_records.analyses_run < ${limit}
    RETURNING analyses_run
  `;

  if (rows.length === 0) {
    throw quotaExceeded(
      `You have used all ${limit} analyses on the ${definition.name} plan this month. They reset on the 1st.`,
      { plan, limit, upgradeTo: plan === "FREE" ? "PRO" : "ENTERPRISE" },
    );
  }
}

export async function releaseQuota(userId: string, adCount: number): Promise<void> {
  await prisma.usageRecord.updateMany({
    where: { userId, periodStart: currentPeriodStart() },
    data: { analysesRun: { decrement: 1 }, adsProcessed: { decrement: adCount } },
  });
}

export async function recordTokenUsage(userId: string, inputTokens: number, outputTokens: number): Promise<void> {
  await prisma.usageRecord.updateMany({
    where: { userId, periodStart: currentPeriodStart() },
    data: { inputTokens: { increment: inputTokens }, outputTokens: { increment: outputTokens } },
  });
}

export function assertFeature(plan: Plan, feature: keyof (typeof PLANS)["FREE"]["limits"], message: string): void {
  const value = PLANS[plan].limits[feature];
  if (value === false) throw forbidden(message);
}

export function assertExportFormat(plan: Plan, format: "pdf" | "markdown" | "json" | "csv"): void {
  if (!PLANS[plan].limits.exportFormats.includes(format)) {
    throw forbidden(`${format.toUpperCase()} export is available on Pro. Markdown and JSON are included on every plan.`);
  }
}
