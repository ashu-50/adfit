import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";
import { getUsage } from "@/lib/billing/entitlements";
import { PLANS } from "@/lib/billing/plans";
import { dashboardStats } from "@/lib/db/repositories/analysis";

export const runtime = "nodejs";

export const GET = route({}, async ({ user }) => {
  const [usage, stats] = await Promise.all([getUsage(user.id, user.plan), dashboardStats(user.id)]);
  return ok({ usage, stats, plan: PLANS[user.plan] });
});
