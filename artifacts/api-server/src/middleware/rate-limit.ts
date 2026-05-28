/**
 * KV-based rate limiting middleware for sensitive endpoints.
 *
 * Uses a sliding-window counter stored in Cloudflare KV.
 * Each failed auth attempt (401/403) increments the counter with a 15-minute TTL.
 * Successful attempts reset the counter so legitimate users are never permanently locked.
 *
 * Why KV and not Durable Objects?
 *  - Durable Objects are a paid CF feature; KV is available on the free tier.
 *  - For low-traffic endpoints (login), KV's eventual consistency is acceptable.
 *    A small race window (two concurrent requests both reading 0) could allow a
 *    handful of extra attempts, but the window closes on the next write.
 *    This is sufficient protection against automated brute-force attacks.
 *
 * Limits (per IP, per 15-minute window):
 *  - 10 failed attempts → 429 Too Many Requests
 *  - Resets to 0 on success so the owner is never locked out after a typo
 */

import type { Context, Next } from "hono";
import type { AppEnv } from "../types";

const WINDOW_TTL = 15 * 60; // 15 minutes in seconds
const MAX_FAILURES = 10;

/** Extracts the real client IP from Cloudflare headers. */
function getClientIp(c: Context<AppEnv>): string {
  return (
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * Applies a sliding-window rate limit to the wrapped route.
 * Mount it *before* the route handler:
 *   auth.post("/auth/login", loginRateLimit, handler)
 */
export async function loginRateLimit(c: Context<AppEnv>, next: Next): Promise<Response> {
  const kv = c.env.SESSIONS;
  const ip = getClientIp(c);
  const key = `rl:login:${ip}`;

  const stored = await kv.get(key);
  const failures = stored ? parseInt(stored, 10) : 0;

  if (failures >= MAX_FAILURES) {
    return c.json(
      {
        error: "Too many failed attempts",
        message: `Too many incorrect PINs from your device. Please wait 15 minutes and try again.`,
        retryAfterSeconds: WINDOW_TTL,
      },
      429,
    ) as Response;
  }

  await next();

  // Increment counter only on auth failures (wrong PIN / not found)
  if (c.res.status === 401 || c.res.status === 403) {
    const newCount = failures + 1;
    // Sliding window: TTL resets on each failure so the lockout extends
    // each time someone keeps trying. Stops when they stop.
    await kv.put(key, String(newCount), { expirationTtl: WINDOW_TTL });

    // Add remaining-attempts hint to the response headers
    const remaining = Math.max(0, MAX_FAILURES - newCount);
    c.res.headers.set("X-RateLimit-Remaining", String(remaining));
    c.res.headers.set("X-RateLimit-Limit", String(MAX_FAILURES));
  } else if (c.res.status >= 200 && c.res.status < 300) {
    // Successful login — clear the failure counter so the owner is never
    // permanently locked after a run of typos
    if (failures > 0) await kv.delete(key);
  }

  return c.res as Response;
}
