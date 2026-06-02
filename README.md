# GreenLink OS

A mobile-first PWA for two Kenyan agrochemical retail shops — **GreenLink Farm Supplies** and **Sunrise Agrovet**. Provides PIN-based point-of-sale, inventory management, customer debt tracking, OCR invoice scanning, push notifications, and analytics dashboards.

---

## Architecture

```
Browser (PWA)  →  Vite Dev Proxy  →  Cloudflare Workers API
                   /api/*               (Hono + D1 + KV + R2)
```

- **Frontend**: React 19 + Vite 7 + Tailwind CSS v4, served on port 5000
- **Backend**: Hono on Cloudflare Workers — `https://greenlink-pos-api.bruce42oyugi.workers.dev`
- **Database**: Cloudflare D1 (SQLite) — two shops share one DB via `shop_id`
- **Sessions**: Cloudflare KV (24h TTL bearer tokens)
- **Storage**: Cloudflare R2 (invoice images)
- **AI/OCR**: Google Gemini Vision + Groq (Llama) — keys stored as Worker secrets

---

## Project Structure

```
/
├── artifacts/
│   └── api-server/          # Cloudflare Worker (Hono API)
│       ├── src/
│       │   ├── worker.ts    # CF Worker entry point
│       │   ├── routes/      # All API route handlers
│       │   ├── lib/         # Auth, DB, bootstrap SQL, web-push
│       │   ├── middleware/  # Auth guard, rate limiter
│       │   └── types.ts
│       └── wrangler.toml    # CF bindings (D1, KV, R2, VAPID)
├── lib/
│   ├── db/                  # Drizzle ORM schema (13 tables)
│   ├── api-spec/            # OpenAPI spec + Orval config
│   ├── api-zod/             # Generated Zod validation schemas
│   └── api-client-react/    # Generated React Query hooks + customFetch
├── scripts/
│   ├── src/
│   │   ├── seed-d1.ts       # Seed production CF D1 database
│   │   ├── seed-products.ts # Seed local SQLite (dev only)
│   │   ├── check-schema.ts  # Validate Drizzle schema vs bootstrap SQL
│   │   └── smoke-test.ts    # API smoke tests
│   └── post-merge.sh        # Runs after git merges (pnpm install)
└── artifacts/greenlink-app/ # React Vite PWA frontend
    ├── src/
    │   ├── pages/           # POS, Stock, Debts, Reports, OCR, Settings
    │   ├── components/      # Shared UI components
    │   ├── hooks/           # React Query wrappers
    │   └── sw.ts            # Service Worker (offline + push)
    └── vite.config.ts       # Proxies /api → CF Worker
```

---

## Running Locally

```bash
# Install dependencies
pnpm install

# Start the frontend (connects to live CF Worker)
pnpm --filter @workspace/greenlink-app run dev
# → http://localhost:5000
```

> All `/api/*` calls are proxied from the Vite dev server directly to the live Cloudflare Worker. No local backend is needed.

---

## Default PINs (production D1)

| Shop | Role | PIN |
|------|------|-----|
| GreenLink Farm Supplies | Owner | `1234` |
| GreenLink Farm Supplies | Cashier | `5678` |
| Sunrise Agrovet | Owner | `1234` |
| Sunrise Agrovet | Cashier | `5678` |

---

## Deploying

```bash
# Deploy everything (CF Worker + build frontend)
pnpm deploy

# Deploy only the CF Worker API
pnpm deploy:api

# Build only the frontend (for Vercel / static hosting)
pnpm deploy:frontend
```

> Requires `CLOUDFLARE_API_TOKEN` set as an environment secret.

### First-time Worker secrets (set once via Wrangler)
```bash
wrangler secret put GEMINI_API_KEY
wrangler secret put VAPID_PRIVATE_KEY_JWK
```

---

## API Codegen

The API client (React Query hooks + Zod schemas) is auto-generated from the OpenAPI spec:

```bash
# Regenerate after editing lib/api-spec/openapi.yaml
pnpm --filter @workspace/api-spec run codegen
```

---

## Seeding the Database

```bash
# Seed production CF D1 (2,583 products × 2 shops)
pnpm --filter @workspace/scripts exec tsx src/seed-d1.ts

# Validate schema consistency
pnpm check-schema

# Run API smoke tests
pnpm smoke-test
# pnpm smoke-test:prod   ← against live CF Worker
```

---

## Key Features

| Feature | Details |
|---------|---------|
| **POS** | Fuzzy product search (2,600+ products), cart, KES checkout, auto-discounts (5–20%) |
| **Inventory** | Stock tracking, price history, bulk Excel import/export, low-stock alerts |
| **Debts** | Customer debt ledger, payment recording, overdue reminders |
| **OCR** | Gemini Vision scans handwritten notebooks and supplier invoices |
| **Reports** | Revenue, profit, top products, category charts (owner-only) |
| **Push Alerts** | PWA push notifications for low stock and overdue debts |
| **Multi-shop** | Two shops, one database — all queries filter by `shop_id` |
| **Offline** | Service Worker caches API responses; POS works without internet |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS v4, Wouter, TanStack Query v5 |
| Backend | Hono, Cloudflare Workers, Wrangler |
| Database | Cloudflare D1 (SQLite), Drizzle ORM |
| Sessions | Cloudflare KV |
| Storage | Cloudflare R2 |
| Auth | PIN + SHA-256 (Web Crypto), Bearer tokens |
| AI | Google Gemini Vision, Groq (Llama 4) |
| PWA | Vite PWA Plugin, Workbox, Web Push (VAPID) |
| Monorepo | pnpm workspaces, TypeScript 5.9 |
