import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";
import { AppError } from "@/lib/http/errors";
import { portalSchema } from "@/lib/validation/billing";
import { createPortalSession, stripeConfigured } from "@/lib/billing/stripe";
import { enforceRateLimit } from "@/lib/cache/rate-limit";
import type { z } from "zod";

export const runtime = "nodejs";

type PortalInput = z.infer<typeof portalSchema>;

/**
 * Plan changes, card updates and cancellation all live in Stripe's portal
 * rather than being rebuilt here. Proration, tax and dunning are not worth
 * reimplementing, and the portal is already PCI-scoped.
 */
export const POST = route<PortalInput>({ body: portalSchema }, async ({ user, body }) => {
  if (!stripeConfigured()) {
    throw new AppError("INTERNAL", "Billing is not enabled on this deployment.");
  }
  await enforceRateLimit(
    `portal:${user.id}`,
    { capacity: 10, refillPerSecond: 10 / 60 },
    "Too many requests. Wait a minute and try again.",
  );

  const url = await createPortalSession(user, body.returnPath);
  return ok({ url });
});
