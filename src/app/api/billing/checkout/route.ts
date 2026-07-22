import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";
import { AppError } from "@/lib/http/errors";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation/billing";
import { createCheckoutSession, stripeConfigured } from "@/lib/billing/stripe";
import { enforceRateLimit } from "@/lib/cache/rate-limit";

export const runtime = "nodejs";

export const POST = route<CheckoutInput>({ body: checkoutSchema }, async ({ user, body }) => {
  if (!stripeConfigured()) {
    throw new AppError("INTERNAL", "Billing is not enabled on this deployment.");
  }
  await enforceRateLimit(
    `checkout:${user.id}`,
    { capacity: 5, refillPerSecond: 5 / 60 },
    "Too many checkout attempts. Wait a minute and try again.",
  );

  const url = await createCheckoutSession({ user, plan: body.plan, returnPath: body.returnPath });
  return ok({ url });
});
