# GreenLink & Sunrise Agrovet — Retail OS

A full-stack Point-of-Sale and inventory management system for two agrovet shops in Kenya.
Built on Cloudflare Workers + D1 + KV (backend) and React + Vite (frontend).

---

## Architecture

```
/
├── artifacts/
│   ├── greenlink-app/      # Primary POS frontend (React + Vite, port 19001)
│   ├── greenlink/          # Full-featured OS frontend (React + Vite)
│   ├── greenlink-pos/      # Legacy POS frontend (React + Vite)
│   └── api-server/         # Cloudflare Worker API (Hono + D1 + KV, port 8080)
├── lib/
│   ├── api-client-react/   # Generated React Query hooks (Orval from OpenAPI)
│   └── db/                 # Drizzle schema (shared)
```

## Running the App

Two workflows must be running:

1. **API Server** — `PORT=8080 pnpm --filter @workspace/api-server run dev`
2. **artifacts/greenlink-app: web** — `pnpm --filter @workspace/greenlink-app run dev`

The frontend is served at `/` and calls the API at `/api/*` (routed by Replit's path-based proxy).

## Default Login Credentials

| Shop | Shop ID | Owner PIN | Cashier PIN |
|------|---------|-----------|-------------|
| GreenLink Farm Supplies | `shop-greenlink` | `1234` | `5678` |
| Sunrise Agrovet | `shop-sunrise` | `1234` | *(not seeded)* |

## Key Design Decisions

- **No VITE_API_URL**: The frontend must NOT set `setBaseUrl("/api")` — the generated hooks already include `/api` in every path. Setting a base URL doubles it. Always use `setBaseUrl(null)`.
- **Auth**: PIN-based login (SHA-256 of `"greenlink:" + pin`). Sessions stored in KV with 24h TTL. Token stored in `localStorage` as `greenlink_token`.
- **CORS**: Worker uses `origin: "*"` — works with Replit's proxied domains.
- **Local D1**: SQLite files at `artifacts/api-server/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`.

## Seeding the Database

The worker seeds shops and products on first boot via `GET /api/healthz` bootstrap. To re-seed, check `artifacts/api-server/src/routes/admin.ts` (if present) or POST to `/api/shops` to create a shop with PINs.

## Importing to a New Replit

1. Fork or import this repo.
2. Run `pnpm install` from the workspace root.
3. Start **API Server** workflow first, then the frontend workflow.
4. The local D1 database is auto-created by wrangler on first run.
5. If the database is empty, POST to `/api/shops` with `{ name, ownerWhatsapp, ownerPin, cashierPin }` to create shops.
6. Default shop IDs referenced in the frontend are `shop-greenlink` and `shop-sunrise`.

## Production Deployment (Cloudflare)

The API server is a Cloudflare Worker:
```
cd artifacts/api-server
pnpm run deploy
```
Requires `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, `CF_KV_NAMESPACE_ID` env vars (see `.env.example` if present).

## Feature Summary

| Feature | Owner | Cashier |
|---------|-------|---------|
| POS / Checkout | ✓ | ✓ |
| View Products | ✓ | ✓ |
| Add / Edit Products | ✓ | — |
| Restock Products | ✓ | ✓ |
| Bulk Import (CSV) | ✓ | — |
| Debt Management | ✓ | ✓ |
| Record Debt Payment | ✓ | ✓ |
| Reports & Dashboard | ✓ | — |
| Supplier Management | ✓ | — |
| Change PINs | ✓ | — |
| Audit Log | ✓ | — |

## User Preferences

- App uses KES (Kenyan Shilling) currency formatting throughout.
- Dark theme with lime-green (`#C8FF00`) primary color.
- Mobile-first layout with bottom navigation.
