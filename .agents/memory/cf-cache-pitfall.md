---
name: CF Worker in-memory cache pitfall
description: Why the product list in-memory cache was removed and what to do instead
---

## Rule
Do NOT cache the products list GET response in a module-level Map on the Worker. If a large catalog needs edge caching, key it by shop and validate it with a single indexed `updated_at` probe before serving it.

**Why:** Cloudflare Workers can spin up multiple isolates for the same worker. Each isolate has its own module-level Map. When a product is created on isolate A (which clears A's Map entry), the very next GET may be routed to isolate B — which still has its own 5-minute stale Map entry and returns a list without the new product. This was the root cause of the "disappearing product" bug.

**How to apply:** Never use `kvGet`/`kvSet` or a module-level Map for the catalog result. A Cloudflare edge cache is acceptable only when its key is shop-scoped, the Worker performs a cheap indexed version probe first, and browser responses use `private, no-cache` so clients do not bypass that probe. The internal edge entry may have a short TTL as a fallback.

Sessions still use KV (cross-isolate persistence needed for auth). The 30s in-memory session cache is fine because a stale session is only a problem at logout, and logout evicts the current isolate's cache AND deletes from KV — new requests to fresh isolates always hit KV (which has the deletion).
