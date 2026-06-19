#!/usr/bin/env bash
# Safe one-command deploy for the Cloudflare Worker.
# Usage: bash scripts/deploy-worker.sh
# Requires CLOUDFLARE_API_TOKEN env var or wrangler login session.

set -euo pipefail

echo "▶  Checking dependencies are frozen..."
pnpm install --frozen-lockfile

echo "▶  Typechecking shared libs..."
pnpm run typecheck:libs

echo "▶  Deploying Cloudflare Worker..."
pnpm --filter @workspace/api-server run deploy

echo "✓  Worker deployed to https://greenlink-pos-api.bruce42oyugi.workers.dev"
echo ""
echo "Quick health check:"
curl -sf https://greenlink-pos-api.bruce42oyugi.workers.dev/api/healthz && echo " OK" || echo " FAILED"
