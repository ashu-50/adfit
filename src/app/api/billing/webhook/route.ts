import type Stripe from "stripe";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";
import { AppError, badRequest } from "@/lib/http/errors";
import { claimWebhookEvent, stripe, stripeConfigured, syncSubscription } from "@/lib/billing/stripe";
import { prisma } from "@/lib/db/client";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
/** Signature verification needs the exact bytes Stripe signed, so nothing here
 *  may be cached or statically evaluated. */
export const dynamic = "force-dynamic";

const log = logger.child({ mod: "stripe.webhook" });

/**
 * Every one of these ends in the same place: re-read the customer's
 * subscriptions and write the resulting plan. Listing them explicitly is still
 * worth it — it documents which signals we depend on, and an unrecognised type
 * is acknowledged rather than retried forever.
 */
const HANDLED = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
]);

function customerIdOf(event: Stripe.Event): string | null {
  const object = event.data.object as { customer?: string | { id?: string } | null };
  const customer = object.customer;
  if (typeof customer === "string") return customer;
  if (customer && typeof customer === "object" && typeof customer.id === "string") return customer.id;
  return null;
}

export const POST = route({ auth: false }, async ({ req }) => {
  if (!stripeConfigured()) throw new AppError("INTERNAL", "Billing is not enabled on this deployment.");

  const secret = serverEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new AppError("INTERNAL", "STRIPE_WEBHOOK_SECRET is not set.");

  const signature = req.headers.get("stripe-signature");
  if (!signature) throw badRequest("Missing stripe-signature header.");

  const payload = await req.text();

  let event: Stripe.Event;
  try {
    // Async variant uses Web Crypto, so this handler keeps working unchanged if
    // it is ever moved to the edge runtime.
    event = await stripe().webhooks.constructEventAsync(payload, signature, secret);
  } catch (err) {
    log.warn("rejected webhook with a bad signature", { err: String(err) });
    throw badRequest("Signature verification failed.");
  }

  if (!HANDLED.has(event.type)) {
    return ok({ received: true, handled: false });
  }

  // Claim first: Stripe retries on any non-2xx or timeout, and a replayed
  // event must not re-run the handler.
  const claimed = await claimWebhookEvent(event.id, event.type);
  if (!claimed) {
    log.info("duplicate webhook ignored", { id: event.id, type: event.type });
    return ok({ received: true, duplicate: true });
  }

  const customerId = customerIdOf(event);
  if (!customerId) {
    log.warn("webhook had no customer", { id: event.id, type: event.type });
    return ok({ received: true, handled: false });
  }

  try {
    const snapshot = await syncSubscription(customerId);
    log.info("webhook processed", { id: event.id, type: event.type, plan: snapshot.plan });
    return ok({ received: true, plan: snapshot.plan });
  } catch (err) {
    // Release the claim so Stripe's retry is allowed to do real work; without
    // this, a transient Stripe or database blip would be recorded as handled.
    await prisma.webhookEvent.delete({ where: { id: event.id } }).catch(() => undefined);
    throw err;
  }
});
