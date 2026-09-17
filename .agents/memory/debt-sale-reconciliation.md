---
name: Debt sale reconciliation
description: How to handle debt sales that predate server-side customer-name validation
---

Debt sales without a linked customer-debt row cannot be repaired safely from sale or audit data alone because the customer identity is not stored there. Reconcile them only after the shop explicitly confirms the customer name; never infer a name from products, amount, or date.

**Why:** The API previously allowed a debt sale with a blank customer name, creating a Sales History record while skipping the debt ledger row.

**How to apply:** Keep server-side validation deployed so new nameless debt sales are rejected before writing. Treat any historical unmatched rows as a separate, user-confirmed data-repair task.