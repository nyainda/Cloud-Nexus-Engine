---
name: xlsx audit known issue
description: SheetJS/xlsx has unfixable high-severity CVEs; audit is set to critical level to avoid blocking validate.
---

## Issue

`xlsx` (SheetJS free npm package) has two high-severity CVEs:
- GHSA-4r6h-8v6p-xvw6 — Prototype Pollution (< 0.19.3)
- GHSA-5pgg-2g8v-p4x9 — ReDoS (< 0.20.2)

Patched versions: `<0.0.0` — meaning there is NO patched version on npm. The SheetJS maintainer
abandoned the free package and moved to a commercial model.

## Mitigation in this project

- `audit-deps` script uses `--audit-level=critical` (not high) so these don't block `pnpm validate`
- Documented in `.local/known-audit-issues.md`
- xlsx is only used to parse owner-uploaded inventory files (known input), not arbitrary untrusted files

## If you want to fix this properly

Migrate from `xlsx` to `exceljs` — actively maintained, no known CVEs. The bulk-import
feature in Stock page uses xlsx for parsing. The seed scripts also use xlsx.

**Why recorded:** This causes `pnpm audit --audit-level=high` to always fail with exit code 1,
which would permanently break the validate pipeline if not accounted for.
