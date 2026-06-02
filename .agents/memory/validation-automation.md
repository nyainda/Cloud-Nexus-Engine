---
name: Validation automation
description: Five-layer safety net added to the project to prevent regressions and catch breakage early.
---

## Layers

1. **`pnpm validate`** — master safety command: typecheck:libs + check-schema + audit-deps (critical level)
2. **`pnpm run check-schema`** — parses bootstrap-sql.ts and lib/db/src/schema/index.ts as text, diffs columns per table. Catches the Drizzle-vs-bootstrap-SQL class of bug.
3. **`pnpm run smoke-test`** — 12 sequential node:test tests against the live API: health, shops (public), auth (valid + invalid + unauth), products FTS5+bare, debts, inventory, notifications, suppliers, audit log.
4. **Pre-commit hook** — `.husky/pre-commit` runs typecheck:libs + check-schema before every commit. Also copied to `.git/hooks/pre-commit` directly (git config core.hooksPath is blocked in Replit agent).
5. **`pnpm run check-updates`** — wraps `pnpm outdated` to show which packages have newer versions (exits 1 when outdated — expected, informational only).

## Important notes

- `pnpm validate` uses `typecheck:libs` only (not full `typecheck`). api-server has pre-existing TS errors in storage.ts, web-push.ts, node-server.ts that are known unfixable. Use `pnpm run typecheck:full` to see all errors.
- `smoke-test` uses `{ concurrency: false }` in one describe block so tests run sequentially (auth sets token before products tests run).
- Products endpoint returns `{ products: [] }` for FTS5 path (q present) and bare `[]` for no-query path — smoke-test handles both.
- `push_subscriptions` table intentionally exists only in bootstrap SQL (not in Drizzle schema) — schema checker warns but does not fail on this.

**Why:**
- The biggest recurring failure mode is Drizzle schema and bootstrap SQL getting out of sync (seen with price_history changed_at vs created_at).
- The smoke tests were written after discovering the products endpoint shape is `{ products: [] }` not bare `[]`.
