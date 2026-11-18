---
name: Cloudflare Worker deploy runtime
description: Runtime constraint for Wrangler production deployments in this workspace.
---

Wrangler v4 exits under Node 20 even when pnpm's engine warning reports a different Node version. This workspace can expose different Node versions through shell and package-script PATH; selecting the Node 22 module resolved deployment.

**Why:** the first Cloudflare deployment attempt failed because Wrangler was launched under Node 20.

**How to apply:** before running the API deploy script, verify the runtime used by the package script is Node 22 or newer and below Node 23, then use the package-management skill if the runtime needs to be selected.
