# GreenLink & Sunrise Agrovet Retail Operations OS

A mobile-first PWA for two Kenyan agrochemical/farm supply retail shops — PIN-based auth, offline-capable POS with fuzzy search across 2,609 products, inventory management, customer debt tracking, OCR scanning (Gemini Vision), analytics dashboards, and Excel bulk import.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the Cloudflare Worker locally via `wrangler dev` (port 8080, local D1 + KV)
- `pnpm --filter @workspace/api-server run deploy` — deploy the worker to Cloudflare production
- `pnpm --filter @workspace/greenlink-app run dev` — run the React Vite POS frontend (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- No DATABASE_URL needed — uses Cloudflare D1 (local SQLite via Wrangler)

## API Architecture (IMPORTANT — do not break this)

**ALL API calls — both local dev and production — go through the Cloudflare Worker (`src/worker.ts`).**

- Local dev: `wrangler dev` binds to port 8080. Vite proxy forwards `/api/*` → `localhost:8080`.
- Production: Vercel frontend sets `VITE_API_BASE_URL=https://greenlink-pos-api.bruce42oyugi.workers.dev`.
- The Node.js entry (`src/index.ts`) is kept for reference only — it is NOT used.
- **Never add raw `fetch()` calls** in frontend pages. Always use:
  1. Generated hooks from `@workspace/api-client-react` (preferred — auto baseUrl + auth)
  2. `customFetch` from `@workspace/api-client-react` for endpoints not yet in the OpenAPI spec

## Seed the database

Local dev (Node.js, writes to `data/greenlink.db`):
```
pnpm --filter @workspace/scripts exec tsx src/seed-products.ts
```

Cloudflare D1 (production):
```
pnpm --filter @workspace/scripts exec tsx src/seed-d1.ts
```

Re-seeds both shops with 2,583 clean products from the Excel file. Cleaning rules applied:
- Removes 21 duplicate product names (keeps first by SKU order)
- Fixes 28 products where buying price > selling price (swaps the prices)
- Derives buying price from profit margin if missing
- Infers category from product name (Herbicides, Fungicides, Insecticides, Fertilizers, Seeds, Equipment, Acaricides, Animal Health, Agrochemicals)

## Default PINs (after seed)

- **Owner PIN**: `1234`  
- **Cashier PIN**: `5678`
- Works for both GreenLink and Sunrise Agrovet shops

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Hono on Cloudflare Workers (via Wrangler)
- DB: Cloudflare D1 (SQLite) + Drizzle ORM (`drizzle-orm/d1`)
- Storage: Cloudflare R2
- Sessions: Cloudflare KV (24h TTL bearer tokens)
- PIN hashing: Web Crypto SHA-256 with `greenlink:` salt prefix
- Validation: Zod (`zod/v4`), generated via Orval from OpenAPI spec
- Frontend: React + Vite PWA, Tailwind CSS v4, Recharts, Framer Motion
- API codegen: Orval (from OpenAPI spec → React Query hooks + Zod schemas)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts (40+ endpoints)
- `lib/api-zod/src/generated/api.ts` — generated Zod schemas
- `lib/api-client-react/src/generated/api.ts` — generated React Query hooks + fetch calls
- `lib/api-client-react/src/custom-fetch.ts` — custom fetch with `setBaseUrl()` and `setAuthTokenGetter()`
- `lib/db/src/schema/index.ts` — Drizzle schema for all 13 tables
- `artifacts/api-server/src/index.ts` — Hono app entry, bootstraps D1 tables on startup
- `artifacts/api-server/src/lib/db.ts` — `BOOTSTRAP_SQL` (CREATE TABLE IF NOT EXISTS for all tables)
- `artifacts/api-server/wrangler.toml` — CF Workers config (D1, R2, KV bindings, port 8080)
- `artifacts/greenlink-app/src/` — React Vite PWA

## Architecture decisions

- **Two shops, one database**: GreenLink and Sunrise Agrovet share one D1 database. Every table has `shop_id` as a discriminator. Products, sales, debts, inventory are all per-shop. No cross-contamination since every query filters by `shop_id`. Benefits: single backup, single migration, cross-shop owner analytics possible, one CF billing account.
- No Replit-specific services (no Replit DB/Storage/AI) — all Cloudflare Workers free tier
- D1 tables bootstrapped lazily on first request via `BOOTSTRAP_SQL` (no migration CLI needed for dev)
- PIN hashing uses Web Crypto (native to CF Workers runtime), not bcrypt
- Session tokens are UUID v4 stored in KV with 24h TTL — no JWT, no cookie
- Auth context: Bearer token in Authorization header, stored in localStorage on frontend
- Session data cached in localStorage (`greenlink_session_cache`) to skip loading spinner on revisit
- Shops list (`GET /api/shops`) is public (no auth) — required for login page shop selector
- Vite dev proxy: `/api` → `http://localhost:8080` (where wrangler dev binds in the Replit environment)

## Product

- **Login**: PIN-based with shop selector and owner/cashier role toggle
- **POS**: Fuzzy product search + cart + KES checkout + debt capture. Cashier sees buying price. Auto-discount buttons (5%, 10%, 15%, 20%)
- **Stock**: Inventory list with restock, price edit, bulk Excel import
- **Debts**: Customer debt ledger with payment recording
- **Alerts**: Low-stock and debt reminder notifications
- **Reports**: Daily summary, date-range analytics, top products, category breakdown, revenue+profit charts (owner only)
- **OCR**: Camera scan for handwritten notebooks and supplier invoices (Gemini Vision) — requires GEMINI_API_KEY
- **Settings**: Shop config, PIN change, supplier CRUD, audit log
- **Mobile topbar**: Shop name, role indicator, logout button (works for both owner and cashier)

## User preferences

- No Replit-specific services — Cloudflare Workers (D1, R2, KV) only
- Premium dark design: #0A0A0A background, Electric Lime #C8FF00 accent
- Fonts: Clash Display (headings), Syne, DM Sans (body), JetBrains Mono (numbers/prices)
- Mobile-first PWA
- Prices always in KES format with thousands separator

## Push Notifications (PWA)

- **VAPID public key** in `wrangler.toml` `[vars]` — safe to commit
- **VAPID private key** uploaded as Worker secret: `wrangler secret put VAPID_PRIVATE_KEY_JWK`
- **Service worker**: `artifacts/greenlink-app/src/sw.ts` — custom injectManifest SW (handles push + precaching + network-first API)
- **Subscribe endpoint**: `POST /api/push/subscribe` — stores subscription in `push_subscriptions` D1 table
- **Test endpoint**: `POST /api/push/test` — owner only, sends test push to all subscribed devices
- **Auto-triggers**: push sent when `/api/notifications/generate` creates new alerts (low stock, debt overdue, expiry)
- **Frontend**: Alerts page shows "Enable" banner when push is not active; "Active" indicator + Test/Disable controls when enabled
- For local dev, push sending is skipped if `VAPID_PRIVATE_KEY_JWK` is not set in `.dev.vars`

## Cloudflare Deployment

- **Worker URL**: `https://greenlink-pos-api.bruce42oyugi.workers.dev`
- **D1 database**: `greenlink-db` (ID: `e3598c00-9fda-4e77-8c5b-8515a94d3de7`) — 2,583 products seeded per shop
- **KV namespace**: ID `3b54b79e` — session storage
- **Shop IDs in D1**: `shop-greenlink` and `shop-sunrise` (NOT UUIDs — different from local dev seed)
- **GEMINI_API_KEY**: uploaded as a Worker secret via `wrangler secret put`
- **Health check**: `GET https://greenlink-pos-api.bruce42oyugi.workers.dev/api/healthz` — returns `{ status: "ok", db: "d1" }` when D1 is reachable

## Vercel Deployment (frontend only)

- **Build**: `pnpm --filter @workspace/greenlink-app build` → `artifacts/greenlink-app/dist/public`
- **Required env var in Vercel**: `VITE_API_BASE_URL=https://greenlink-pos-api.bruce42oyugi.workers.dev`
- All `/api/*` calls go directly to the CF Worker (not Vercel serverless)
- `vercel.json` serves the SPA with a single catch-all rewrite to `index.html`

## Gotchas

- **Port conflict**: Replit injects `PORT=8080` into all processes. Wrangler always starts on 8080. The `API Server` workflow (which also uses 8080) will fail — that's expected. Only `artifacts/api-server: API Server` should run.
- **Vite proxy**: `artifacts/greenlink-app/vite.config.ts` proxies `/api` → `localhost:8080`. Do NOT change this to 8787.
- D1 `exec()` does NOT support multi-statement SQL in local mode — use `prepare(stmt).run()` per statement
- `workerd` must be in `pnpm-workspace.yaml` `onlyBuiltDependencies` for Wrangler to work
- GEMINI_API_KEY is a Worker secret (not a `[vars]` entry) — set via `wrangler secret put GEMINI_API_KEY`
- `lib/db` tsconfig must include `@cloudflare/workers-types` in the types array
- `db.ts` uses ESM dynamic imports only — no `require()` (breaks in Node.js ESM mode)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Generated client `setAuthTokenGetter` / `setBaseUrl` in `lib/api-client-react/src/custom-fetch.ts`

## ⛔ Agent: Critical Rules — DO NOT Repeat These Mistakes

These are real mistakes a previous agent made that broke the entire project. Read before touching anything.

### 1. NEVER convert the API to Node.js / Express / libSQL
- The API runs **exclusively on Cloudflare Workers** via Wrangler (`src/worker.ts`)
- `src/index.ts` exists for reference only — it is NOT the entry point
- Database must be **Drizzle ORM with `drizzle-orm/d1`**, not libSQL, better-sqlite3, or any Node.js driver
- Sessions must use **`KVNamespace`** (Cloudflare KV), never express-session or JWT
- Auth hashing must use **`crypto.subtle` (Web Crypto API)**, not bcrypt or argon2

### 2. NEVER change the Vite proxy port
- `vite.config.ts` proxies `/api` → `http://localhost:8080` (wrangler dev port)
- Do NOT change 8080 to 8787 or any other port

### 3. NEVER call `createDb()` without the D1 argument
- Every route must call `createDb(c.env.DB)` — not `createDb()` with no argument
- `c.env.DB` is the D1 binding injected by Cloudflare Workers

### 4. Drizzle column names must match the actual D1 schema exactly
- The `price_history` table uses `changed_at` (NOT `created_at`) — using the shared `createdAt()` helper causes a NOT NULL constraint error
- Always verify column names in `lib/db/src/schema/index.ts` match `artifacts/api-server/src/lib/bootstrap-sql.ts`
- When adding a new column to Drizzle schema, also add it to `bootstrap-sql.ts` AND add an `ALTER TABLE` migration to `artifacts/api-server/src/worker.ts` MIGRATIONS array

### 5. NEVER use Replit DB, Replit Storage, or Replit AI
- User explicitly requires Cloudflare Workers free tier only
- All storage: D1 (SQLite), KV (sessions), R2 (file storage)

### 6. D1 local mode quirks
- `db.exec()` does NOT work for multi-statement SQL in local mode — use `db.prepare(stmt).run()` per statement
- Migrations run in a try-catch loop — failures are silently ignored (column already exists)

### 7. Product search includes category
- `GET /api/products?q=` searches `normalizedName`, `canonicalName`, `sku`, AND `category`
- Do not remove category from the search filter

### 8. Correct API route paths
- Inventory: `GET /api/inventory-movements` (NOT `/api/inventory`)
- Audit log: `GET /api/audit` (NOT `/api/audit-log`)
- Debt payments: `POST /api/debts/:id/payments` (plural)
- Price history: `GET /api/products/:id/price-history`
