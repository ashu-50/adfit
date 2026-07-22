import Stripe from "stripe";
import type { Plan } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { clientEnv, serverEnv } from "@/lib/env";
import { AppError, badRequest } from "@/lib/http/errors";
import { logger } from "@/lib/logger";
import { planForPriceId, priceIdFor } from "./plans";
import type { SessionUser } from "@/lib/auth/session";

const log = logger.child({ mod: "stripe" });

let client: Stripe | null = null;

/** Billing is optional: self-hosters can run the whole app on the free tier. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  const key = serverEnv().STRIPE_SECRET_KEY;
  if (!key) throw new AppError("INTERNAL", "Billing is not configured on this deployment.");
  if (!client) {
    // No apiVersion override: the SDK pins the version it was built against,
    // which is the pairing its types describe. Overriding here is how you get
    // types that quietly disagree with the payloads you actually receive.
    client = new Stripe(key, { typescript: true, maxNetworkRetries: 2, appInfo: { name: "adfit", version: "1.0.0" } });
  }
  return client;
}

function appUrl(path = "/"): string {
  return new URL(path, clientEnv.NEXT_PUBLIC_APP_URL).toString();
}

/**
 * Subscription shape differs across Stripe API versions: `current_period_end`
 * sat on the subscription for years and moved onto the line items later. Read
 * both rather than pinning ourselves to one SDK major.
 */
function periodEndOf(sub: Stripe.Subscription): Date | null {
  const loose = sub as unknown as {
    current_period_end?: number | null;
    items?: { data?: Array<{ current_period_end?: number | null }> };
  };
  const ts = loose.current_period_end ?? loose.items?.data?.[0]?.current_period_end ?? null;
  return ts ? new Date(ts * 1000) : null;
}

/** past_due keeps access during the retry window; Stripe cancels if it fails out. */
const ENTITLED: ReadonlySet<string> = new Set(["active", "trialing", "past_due"]);

/**
 * Attaches a Stripe customer to the user, exactly once.
 *
 * Two tabs clicking Upgrade at the same moment would otherwise mint two
 * customers and the second would overwrite the first, orphaning a subscription
 * that still bills. The conditional update makes the DB arbitrate: the loser
 * discards its customer and adopts the winner's.
 */
export async function ensureCustomer(user: SessionUser): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe().customers.create({
    email: user.email,
    name: user.fullName ?? undefined,
    metadata: { userId: user.id },
  });

  const claimed = await prisma.user.updateMany({
    where: { id: user.id, stripeCustomerId: null },
    data: { stripeCustomerId: customer.id },
  });

  if (claimed.count === 1) return customer.id;

  const winner = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true },
  });
  await stripe()
    .customers.del(customer.id)
    .catch((err: unknown) => log.warn("could not delete duplicate customer", { customer: customer.id, err: String(err) }));

  if (!winner?.stripeCustomerId) throw new AppError("INTERNAL", "Could not attach a billing profile.");
  return winner.stripeCustomerId;
}

export type SubscriptionSnapshot = {
  plan: Plan;
  status: string | null;
  subscriptionId: string | null;
  renewsAt: Date | null;
  cancelAtPeriodEnd: boolean;
};

/**
 * The single writer for plan state.
 *
 * Every webhook — checkout completed, subscription updated, invoice paid,
 * subscription deleted — funnels into this one function instead of each
 * carrying its own patch logic. Webhooks arrive out of order and more than
 * once; re-reading the live subscription and writing the whole snapshot makes
 * both facts harmless. Nothing else in the codebase writes `plan`.
 */
export async function syncSubscription(customerId: string): Promise<SubscriptionSnapshot> {
  const subs = await stripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
    expand: ["data.items.data.price"],
  });

  const active = subs.data.find((s) => ENTITLED.has(s.status));
  const snapshot: SubscriptionSnapshot = active
    ? {
        plan: planForPriceId(active.items.data[0]?.price?.id),
        status: active.status,
        subscriptionId: active.id,
        renewsAt: periodEndOf(active),
        cancelAtPeriodEnd: active.cancel_at_period_end,
      }
    : { plan: "FREE", status: subs.data[0]?.status ?? null, subscriptionId: null, renewsAt: null, cancelAtPeriodEnd: false };

  const updated = await prisma.user.updateMany({
    where: { stripeCustomerId: customerId },
    data: {
      plan: snapshot.plan,
      stripeSubscriptionId: snapshot.subscriptionId,
      planRenewsAt: snapshot.renewsAt,
    },
  });

  if (updated.count === 0) {
    // A customer created outside this app, or a user deleted while subscribed.
    log.warn("stripe customer has no matching user", { customerId });
  } else {
    log.info("plan synced", { customerId, plan: snapshot.plan, status: snapshot.status });
  }

  return snapshot;
}

export async function createCheckoutSession(opts: {
  user: SessionUser;
  plan: Plan;
  returnPath?: string;
}): Promise<string> {
  const priceId = priceIdFor(opts.plan);
  if (!priceId) throw badRequest("That plan is not available for self-serve checkout.");
  if (opts.user.plan === opts.plan) throw badRequest(`You are already on ${opts.plan}.`);

  const customerId = await ensureCustomer(opts.user);
  const back = opts.returnPath ?? "/settings/billing";

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: appUrl(`${back}${back.includes("?") ? "&" : "?"}checkout=success`),
    cancel_url: appUrl(`${back}${back.includes("?") ? "&" : "?"}checkout=cancelled`),
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    // Survives even if the customer record is later detached from the user.
    subscription_data: { metadata: { userId: opts.user.id } },
    client_reference_id: opts.user.id,
    metadata: { userId: opts.user.id, plan: opts.plan },
  });

  if (!session.url) throw new AppError("INTERNAL", "Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalSession(user: SessionUser, returnPath = "/settings/billing"): Promise<string> {
  const customerId = await ensureCustomer(user);
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: appUrl(returnPath),
  });
  return session.url;
}

/**
 * Records the event id before any work happens. Stripe retries on timeouts and
 * non-2xx, so the same event will arrive again; the unique primary key turns a
 * duplicate into a cheap no-op instead of a second plan mutation.
 */
export async function claimWebhookEvent(id: string, type: string): Promise<boolean> {
  try {
    await prisma.webhookEvent.create({ data: { id, type } });
    return true;
  } catch {
    return false;
  }
}
