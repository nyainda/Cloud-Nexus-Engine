---
name: D1 production usage hotspots
description: The production usage pattern to check before changing GreenLink persistence
---

Production D1 pressure should be diagnosed with Cloudflare D1 Insights, not inferred from table row counts alone. The leading source can change: notification history and unread-count scans have recently exceeded full product-catalog reads. Normal sale writes are not necessarily the primary quota risk.

The user requires Cloudflare/D1 usage to stay within the free tier and wants shared sales, debt, and inventory changes to appear across devices without clearing caches. Balance freshness against reads: use bounded refreshes for important shared data, not rapid full-catalog or report scans.

**Why:** Live ranked insights showed notification list/count queries as the largest read consumers, so an earlier catalog-focused assumption was incomplete.

**How to apply:** Recheck ranked D1 Insights before every quota optimization. Bound and paginate notification history, avoid repeated scans for exact aggregates, keep polling conservative, and use a shop-scoped edge cache with an indexed version probe for full catalog responses. Do not change financial or notification retention based on assumptions alone.

The user says notifications are rarely used and endorses reducing their D1 activity toward near zero. Preserve deliberate, bounded access without background badge/list polling or deleting history.

**Why:** This is an explicit product usage preference and confirmation of the read-reduction approach, not something inferable from the code.

**How to apply:** For notification changes, prefer manual or in-page refresh and the unread counter; keep history available unless the user explicitly asks to change retention.