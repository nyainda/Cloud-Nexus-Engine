---
name: Debt PDF presentation
description: Durable product decision for debt statements and payment corrections
---

Debt PDFs should show the customer-facing financial result without exposing internal correction mechanics. Reversed payment entries are omitted from statements rather than labeled as reversed, while the displayed totals still come from the corrected debt balance.

**Why:** The owner explicitly wants customer PDFs to remain clean and does not want payment reversals or price-review warnings presented to customers.

**How to apply:** Keep reversal details in the in-app payment history and audit log. Do not add warning labels for zero-price corrections to individual or combined PDFs.