---
name: GreenLink production-only workflow
description: The user's standing instruction to avoid local Replit workflows for GreenLink and use its production hosts.
---

Keep GreenLink's local Replit workflows stopped. The user wants work verified and run against the existing production services rather than spending time on local Replit runs.

**Why:** The user repeatedly asked to use production only and objected to routing the app through Replit.

**How to apply:** Do not start Replit workflows or publish this app through Replit. Use its existing Cloudflare API and Vercel frontend only when the user has authorized the specific production action.
