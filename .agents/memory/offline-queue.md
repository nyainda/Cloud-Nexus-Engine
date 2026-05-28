---
name: Offline queue architecture
description: How offline mutations are queued, synced, and managed in the UI.
---

## Files
- `src/lib/offline-queue.ts` — Dexie DB `greenlink_offline_queue_v1`, table `mutations`
- `src/lib/use-offline-sync.ts` — hook: listens `window online/offline`, processes queue on reconnect
- `src/components/offline-banner.tsx` — sticky banner (4 states: offline, offline+pending, syncing, failed)

## Queue entry schema
`{ id, type: "sale"|"restock"|"debt_payment", shopId, payload: JSON, createdAt, attempts, status: "pending"|"failed" }`

## Payload conventions
- `sale` → full sale body (shopId, saleType, items, discount, servedBy, debtCustomerName, debtCustomerPhone)
- `restock` → `{ productId, qty, newPurchasePrice?, newSellingPrice? }`
- `debt_payment` → `{ debtId, amount, recordedBy }`

## Where offline checks live
- `pos.tsx` handleCheckout: `if (!navigator.onLine) await enqueueMutation("sale", shopId, payload); return;`
- `stock.tsx` RestockDialog: same pattern before the async IIFE
- `debts.tsx` PaymentDialog: same pattern after optimistic update

## Settings page
Settings > Offline Sync section (visible to all roles): shows connection status, pending queue, failed queue with Retry All + Clear buttons.

## Refetch intervals after optimization
- POS products: 5s → 30s (saves ~83% of CF Worker product-polling requests)
- Stock products: 20s → 30s
