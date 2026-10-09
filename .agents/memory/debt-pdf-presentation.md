---
name: Debt PDF presentation
description: Durable product decision for debt statements and payment corrections
---

Debt PDFs should show the customer-facing financial result without exposing internal correction mechanics. Exclude cancelled/voided debt records entirely from customer-facing statements—including summaries, item lists, and payment history—and omit reversed payment entries and their original rows. Do not mention those records or corrections; calculate totals from the surviving records and their current credit balances.

**Why:** The owner explicitly wants customers to see only current financial results, not voided records or internal correction history.

**How to apply:** Apply the same rule to individual and combined debt PDFs. Keep reversal details in the in-app payment history and audit log; do not add warning labels for zero-price corrections.