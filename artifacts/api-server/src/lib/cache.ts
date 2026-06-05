/**
 * Response cache — IN-MEMORY, not KV.
 *
 * Why: the SESSIONS KV namespace has a free-tier budget of only 1,000 writes/day
 * and 100,000 reads/day. Using it for response caching burns through both limits
 * fast — especially during bulk product imports where every batch fires a kvDel
 * (write), and every page load fires a kvGet (read).
 *
 * Cloudflare Worker isolates keep module-level variables alive across warm
 * requests in the same instance, so an in-memory Map gives us:
 *   - Zero KV reads/writes for cache hits and busts
 *   - Sub-millisecond latency (vs 5–60ms for KV)
 *   - No free-tier cost at all
 *
 * Trade-off: if CF spins up a second isolate (cold start / scale-out), each
 * isolate has its own cache — a cache miss on the new isolate hits D1 once and
 * populates its own Map. That's totally fine for a 2-shop POS.
 *
 * Sessions still live in KV (they need cross-instance persistence for auth).
 * The kv parameter is kept in all signatures for backwards compatibility with
 * callers — it is intentionally unused here.
 *
 * Free-tier budget after this change (2 shops, 8hr day):
 *   KV reads  ~50  / day  (session validation — further reduced by auth mem-cache)
 *   KV writes ~20  / day  (login + logout only)
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

// ── Module-level in-memory store ────────────────────────────────────────────
interface MemEntry { value: string; exp: number }
const _mem = new Map<string, MemEntry>();

function memGet<T>(key: string): T | null {
  const entry = _mem.get(key);
  if (!entry) return null;
  if (Date.now() > entry.exp) { _mem.delete(key); return null; }
  try { return JSON.parse(entry.value) as T; } catch { return null; }
}

function memSet(key: string, data: unknown, ttlSeconds: number): void {
  _mem.set(key, { value: JSON.stringify(data), exp: Date.now() + ttlSeconds * 1000 });
}

function memDel(...keys: string[]): void {
  for (const k of keys) _mem.delete(k);
}

// ── Public API (kv param accepted but unused — sessions are handled separately) ──

/** Read a cached value from memory; returns null on miss (never throws). */
export async function kvGet<T>(_kv: KVNamespace, key: string): Promise<T | null> {
  return memGet<T>(key);
}

/** Write a value to the in-memory cache; failures are swallowed. */
export async function kvSet(
  _kv: KVNamespace,
  key: string,
  data: unknown,
  ttlSeconds: number,
): Promise<void> {
  try { memSet(key, data, ttlSeconds); } catch { /* non-fatal */ }
}

/** Delete one or more cache keys from memory (fire-and-forget). */
export async function kvDel(_kv: KVNamespace, ...keys: string[]): Promise<void> {
  memDel(...keys);
}
