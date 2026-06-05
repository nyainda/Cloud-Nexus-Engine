---
name: CF Worker in-memory cache pitfall
description: Why the product list in-memory cache was removed and what to do instead
---

## Rule
Do NOT cache the products list GET response in a module-level Map on the Worker.

**Why:** Cloudflare Workers can spin up multiple isolates for the same worker. Each isolate has its own module-level Map. When a product is created on isolate A (which clears A's Map entry), the very next GET may be routed to isolate B — which still has its own 5-minute stale Map entry and returns a list without the new product. This was the root cause of the "disappearing product" bug.

**How to apply:** The products list route (`GET /api/products`) now always queries D1 directly — no kvGet/kvSet around the list result. D1 runs in ~50-100ms on CF, well within the 800ms budget. The in-memory cache is appropriate only for data that is: (a) read-only or (b) acceptable to serve stale for up to 30s across all isolates.

Sessions still use KV (cross-isolate persistence needed for auth). The 30s in-memory session cache is fine because a stale session is only a problem at logout, and logout evicts the current isolate's cache AND deletes from KV — new requests to fresh isolates always hit KV (which has the deletion).
