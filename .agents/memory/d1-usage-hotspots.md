---
name: D1 production usage hotspots
description: The production usage pattern to check before changing GreenLink persistence
---

Production D1 pressure should be diagnosed with `wrangler d1 insights`, not inferred from table row counts alone. The catalog endpoint can dominate free-tier consumption because each full product-list request scans the active catalog, and a separate count query doubles that scan. Normal sale writes (sale, line items, stock movement, product stock update, and occasional low-stock alert) are comparatively small at the current shop volume.

**Why:** A prior production snapshot looked like a write problem because sales touch several tables, but Cloudflare's ranked metrics showed repeated product reads were the larger quota risk. Removing unnecessary count scans preserved the API total while cutting that repeated read work.

**How to apply:** When D1 usage rises, run `wrangler d1 insights greenlink-db --sort-type=sum --sort-by=reads --timePeriod=1d` and `--sort-by=writes` before changing financial data retention or sale history. Treat frontend polling and duplicate alert generation as separate optimization targets.