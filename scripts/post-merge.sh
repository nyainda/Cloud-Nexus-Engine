#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Deploy the Cloudflare Worker with the latest code changes
pnpm --filter @workspace/api-server run deploy
