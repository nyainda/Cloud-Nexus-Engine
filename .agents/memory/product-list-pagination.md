---
name: Product list pagination for tests and frontend
description: Why tests and the stock page must use limit=3000, not the default limit=100
---

## Rule
Always pass `limit=3000` when fetching the full product list, both in tests and in the stock page.

**Why:** The `GET /api/products` endpoint defaults to `limit=100` with no `ORDER BY`. There are 2,500+ products per shop. New products are inserted at the end of the table, so they appear on page 26+ of 100 — never in the first 100 results. A test using the default limit will never find a newly-created product and will falsely report the disappearing-product bug.

**How to apply:**
- Tests: always use `?shopId=X&limit=3000` when verifying a newly-created product appears in the list
- Frontend stock page: already uses `{ shopId, limit: 3000 }` as the query key — do not change this
- The API caps limit at 3000 (`Math.min(..., 3000)`) so this is safe
