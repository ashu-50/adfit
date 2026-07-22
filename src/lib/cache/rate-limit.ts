import { prisma } from "@/lib/db/client";
import { rateLimited } from "@/lib/http/errors";

export type Bucket = { capacity: number; refillPerSecond: number };

/**
 * Token bucket persisted in Postgres. Chosen over a fixed window because
 * bursty marketer behaviour ("run five analyses, then nothing for an hour")
 * is exactly what a bucket handles gracefully.
 *
 * The refill + consume runs in one statement so concurrent lambdas cannot
 * both read a stale token count. Postgres row locking is the coordination
 * primitive; no Redis required until traffic justifies it.
 */
export async function consumeToken(key: string, bucket: Bucket, cost = 1): Promise<{ allowed: boolean; remaining: number; retryAfterS: number }> {
  const expiresAt = new Date(Date.now() + Math.ceil((bucket.capacity / bucket.refillPerSecond) * 1000) + 60_000);

  const rows = await prisma.$queryRaw<{ tokens: number; allowed: boolean }[]>`
    INSERT INTO rate_limits (key, tokens, last_refill, expires_at)
    VALUES (${key}, ${bucket.capacity - cost}, now(), ${expiresAt})
    ON CONFLICT (key) DO UPDATE SET
      tokens = GREATEST(
        0,
        LEAST(
          ${bucket.capacity}::double precision,
          rate_limits.tokens + EXTRACT(EPOCH FROM (now() - rate_limits.last_refill)) * ${bucket.refillPerSecond}::double precision
        ) - ${cost}::double precision
      ),
      last_refill = now(),
      expires_at = ${expiresAt}
    RETURNING
      tokens,
      (LEAST(
        ${bucket.capacity}::double precision,
        rate_limits.tokens + EXTRACT(EPOCH FROM (now() - rate_limits.last_refill)) * ${bucket.refillPerSecond}::double precision
      ) >= ${cost}::double precision) AS allowed
  `;

  const row = rows[0];
  // First insert has no prior row, so RETURNING's subquery is null: allow it.
  const allowed = row?.allowed ?? true;
  const remaining = Math.floor(row?.tokens ?? bucket.capacity - cost);
  const retryAfterS = allowed ? 0 : Math.ceil(cost / bucket.refillPerSecond);

  return { allowed, remaining, retryAfterS };
}

export async function enforceRateLimit(key: string, bucket: Bucket, message: string, cost = 1) {
  const result = await consumeToken(key, bucket, cost);
  if (!result.allowed) throw rateLimited(message, result.retryAfterS);
  return result;
}

/** In-process concurrency gate. Keeps one instance from stampeding the Gemini quota. */
export function createSemaphore(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}
