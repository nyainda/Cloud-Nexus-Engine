---
name: D1 schema bootstrap across isolates
description: Cloudflare Worker isolates do not share module state, so request-time schema setup must be guarded by a durable D1 marker.
---

Use a persistent D1 migration marker to gate bootstrap and migration DDL. A module-level boolean only suppresses repeated work inside one isolate; cold isolates can otherwise rerun CREATE, ALTER, DROP, and index statements and consume quota.

**Why:** Production D1 insights showed schema DDL repeating across many Worker isolates even though the worker had an in-memory bootstrap flag.

**How to apply:** Keep request handling limited to a cheap marker lookup after the one-time schema work is complete. Remove obsolete FTS creation/triggers when product search uses the base table instead.