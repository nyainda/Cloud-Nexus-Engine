---
name: Auth offline resilience
description: AuthGuard rules for not kicking users out on network errors; instant product seed on startup.
---

## Rule
Only redirect to `/login` when `useGetSession` returns a **401 or 403 status error**. Network errors (TypeError, 5xx, no response) must be silently ignored — the app stays functional using the cached session and IndexedDB product cache.

**Why:** CF Worker cold-starts take 1–5s. If the device is offline when the app opens, `error` is truthy but the token is valid. Old code (`if (error || !session) → redirect`) logged users out every morning on a bad connection.

**How to apply:** Check `(error as any)?.status === 401 || 403` before clearing the token. Any other error: stay on page, OfflineBanner handles the UI.

## Instant product seed
Move IndexedDB product seed to a `useEffect` that runs once on mount (not after session validates). When `cachedSession.shopId` exists, immediately call `loadCachedProducts` + `qc.setQueryData` + `qc.prefetchQuery`. This means POS shows products at 0ms instead of 500ms–2s.

Also: set `retry: false` on `useGetSession` so network failures are detected immediately without extra retry delays.
