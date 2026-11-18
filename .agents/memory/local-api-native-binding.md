---
name: Local API runtime
description: A missing better-sqlite3 native addon can prevent the local API workflow from starting even when Worker route handlers work.
---

The local API-server workflow can fail before opening its port when the Node 22 environment cannot load the `better-sqlite3` native binding. This is separate from Cloudflare Worker route behavior.

**Why:** The local server failed during SQLite initialization, while the Nursery Hono handlers passed isolated in-memory route tests and the deployed Worker health check confirmed D1 connectivity.

**How to apply:** When startup fails specifically at the native binding, diagnose the local runtime separately. Use an isolated route test for API logic; do not change Cloudflare D1 bindings or production data to work around a local development dependency issue.
