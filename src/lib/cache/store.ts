import { LRUCache } from "lru-cache";
import { prisma } from "@/lib/db/client";
import { sha256 } from "@/lib/utils";
import { logger } from "@/lib/logger";

/**
 * Two-tier cache. The in-process LRU absorbs repeat hits inside one warm
 * lambda; Postgres survives cold starts and is shared across instances.
 * Swapping in Redis means replacing `readDb`/`writeDb` only.
 */
const memory = new LRUCache<string, { value: unknown; expiresAt: number }>({
  max: 500,
  ttl: 10 * 60 * 1000,
});

export async function cacheKey(namespace: string, parts: unknown[]): Promise<string> {
  return sha256(`${namespace}::${JSON.stringify(parts)}`);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const hit = memory.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;

  try {
    const row = await prisma.cacheEntry.findUnique({ where: { key } });
    if (!row || row.expiresAt.getTime() <= Date.now()) return null;
    memory.set(key, { value: row.value, expiresAt: row.expiresAt.getTime() });
    // Fire and forget: hit counts inform TTL tuning but must never block a read.
    void prisma.cacheEntry.update({ where: { key }, data: { hits: { increment: 1 } } }).catch(() => {});
    return row.value as T;
  } catch (err) {
    logger.warn("cache read failed, continuing uncached", { err: String(err) });
    return null;
  }
}

export async function cacheSet(key: string, namespace: string, value: unknown, ttlSeconds: number): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  memory.set(key, { value, expiresAt: expiresAt.getTime() });
  try {
    await prisma.cacheEntry.upsert({
      where: { key },
      create: { key, namespace, value: value as object, expiresAt },
      update: { value: value as object, expiresAt },
    });
  } catch (err) {
    logger.warn("cache write failed, continuing", { err: String(err) });
  }
}

/** Read-through helper. A miss runs `producer`; a producer throw is not cached. */
export async function cached<T>(
  namespace: string,
  parts: unknown[],
  ttlSeconds: number,
  producer: () => Promise<T>,
  opts?: { skip?: boolean },
): Promise<{ value: T; hit: boolean }> {
  const key = await cacheKey(namespace, parts);
  if (!opts?.skip) {
    const hit = await cacheGet<T>(key);
    if (hit !== null) return { value: hit, hit: true };
  }
  const value = await producer();
  await cacheSet(key, namespace, value, ttlSeconds);
  return { value, hit: false };
}
