---
name: Quotation invoice lifecycle
description: Product boundaries for invoices issued from quotations
---

An invoice issued from an accepted quotation is a persistent, immutable document tied to that quote. Issuing the document alone does not record payment, complete a sale, or change inventory.

**Why:** A quotation can be prepared before goods are sold or paid for; treating document issuance as checkout would alter stock and sales totals prematurely.

**How to apply:** Keep invoice identity and quoted customer/item amounts stable after issue. Add payment and fulfillment as explicit linked workflows rather than silently changing the invoice or treating it as a POS sale.