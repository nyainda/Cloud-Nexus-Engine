import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";
import { getSession } from "../lib/auth";
import type { SessionData } from "../types";

/**
 * In-memory session cache — lives at the isolate level.
 *
 * Auth tokens are validated against KV on every authenticated request.
 * With ~10 routes per page load and 2 active users, that's 20+ KV reads/minute
 * just for session checks — burning through the 100k/day free limit fast.
 *
 * This cache holds verified session data for 30 seconds. If the token is in
 * memory it skips KV entirely. On a cache miss it hits KV once and stores the
 * result. Logout explicitly evicts the token so there's no stale-session risk.
 *
 * TTL is intentionally short (30s) so PIN changes / logouts propagate quickly
 * across any concurrent isolate instances.
 */
interface SessionCacheEntry { data: SessionData; exp: number }
const _sessionCache = new Map<string, SessionCacheEntry>();
const SESSION_MEM_TTL_MS = 30_000; // 30 seconds

export function evictSessionCache(token: string): void {
  _sessionCache.delete(token);
}

async function resolveSession(kv: KVNamespace, token: string): Promise<SessionData | null> {
  const now = Date.now();
  const cached = _sessionCache.get(token);
  if (cached && now < cached.exp) return cached.data;

  const data = await getSession(kv, token);
  if (data) _sessionCache.set(token, { data, exp: now + SESSION_MEM_TTL_MS });
  else _sessionCache.delete(token);
  return data;
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = auth.replace("Bearer ", "");
  const session = await resolveSession(c.env.SESSIONS, token);
  if (!session) {
    return c.json({ error: "Session expired or invalid" }, 401);
  }
  c.set("session", session);
  await next();
});

export const requireOwner = createMiddleware<AppEnv>(async (c, next) => {
  const session = c.get("session");
  if (!session || session.role !== "owner") {
    return c.json({ error: "Owner access required" }, 403);
  }
  await next();
});
