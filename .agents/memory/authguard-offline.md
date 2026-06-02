---
name: AuthGuard offline-first fix
description: How the AuthGuard handles offline PWA refresh without logging the user out
---

## Rule
When the device is offline (`!navigator.onLine`):
1. Disable `useGetSession` query entirely (`enabled: !!token && isOnline`)
2. `ready` initialises to `true` if token exists AND (cachedSession exists OR offline)
3. Effect: when `!isOnline`, call `setReady(true)` and `return` immediately — never redirect
4. The "no session, no cache → redirect" branch must only fire when `isOnline`

## Why
Three root causes combined to log users out on offline refresh:
- `useGetSession` was enabled regardless of connectivity → fired against CF Worker → failed
- React Query error object shape on network failures is a `TypeError` (no `.status`) — but if the SW somehow returns a synthetic empty response (no error, no data), the `else if (!cachedSession)` branch fired and redirected to `/login`
- `ready` required BOTH token AND cachedSession — if the OS cleared localStorage (common on low-memory Android/iOS), `ready=false` forever → infinite spinner → user thinks app is broken

## How to apply
Track `isOnline` with `window.addEventListener("online"/"offline")` in AuthGuard.
Pass `enabled: !!token && isOnline` to `useGetSession`.
Guard all redirect-to-login logic with `isOnline` checks.
`ready` init: `!!token && (!!cachedSession || !navigator.onLine)`.
