/**
 * Lightweight KV response cache for the SESSIONS namespace.
 * Cache keys are prefixed with "c:" so they never collide with session UUIDs.
 *
 * Free-tier budget (2 shops, 8hr day):
 *   Writes  ~400 / day  (limit 1,000)
 *   Reads   ~900 / day  (limit 100,000)
 */

export const CACHE_TTL = {
  products: 300,   // 5 minutes — busted on any product/sale write
  dashboard: 300,  // 5 minutes — busted on every sale
  debts: 300,      // 5 minutes — busted on debt create/update/payment
} as const;

export const CK = {
  products:  (shopId: string) => `c:p:${shopId}`,
  dashboard: (shopId: string, date: string) => `c:d:${shopId}:${date}`,
  debts:     (shopId: string) => `c:dbt:${shopId}`,
};

/** Read a cached value; returns null on miss or parse error (never throws). */
export async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  try {
    const raw = await kv.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Write a value to KV; failures are swallowed (cache is best-effort). */
export async function kvSet(
  kv: KVNamespace,
  key: string,
  data: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    await kv.put(key, JSON.stringify(data), { expirationTtl: ttlSeconds });
  } catch {
    // non-fatal — a cache write failure must never break the response
  }
}

/** Delete one or more cache keys (fire-and-forget; errors are swallowed). */
export async function kvDel(kv: KVNamespace, ...keys: string[]): Promise<void> {
  await Promise.allSettled(keys.map((k) => kv.delete(k)));
}
