---
name: Customer credit accounting
description: Accounting rules for overpayments, available credit, and safely reversing credit use
---

Customer overpayment is stored as a negative balance on a debt record. Keep positive debt due and negative customer credit distinct in every total and view. Apply existing credit FIFO to the customer's oldest open debt or the next POS debt sale. Customer-level paid totals include carried credit: total owed minus outstanding due plus available credit.

Treat a debt marked `paid` with a positive balance or no payment records as a ledger anomaly. Do not hide the discrepancy by changing PDF totals from status alone; reconcile the underlying record explicitly.

**Why:** This reuses the existing debt ledger for credit while preserving customer balances across sales. Credit applications currently do not preserve a durable source-to-target allocation, so reversing an application or a source payment after the credit was spent can corrupt the ledger. Legacy paid-status flags can also disagree with balances and payment history.

**How to apply:** Derive due as `max(balance, 0)` and credit as `max(-balance, 0)`. Reconcile paid-status conflicts against an explicit, confirmed source before changing balances or PDFs. Do not restore spent credit through a simple balance reversal. Until credit source references are recorded and honored by sale voids/reversals, reject unsafe reversals explicitly and keep the customer-facing PDF focused on current balances and credit.
