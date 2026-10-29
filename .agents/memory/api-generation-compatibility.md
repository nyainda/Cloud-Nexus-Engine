---
name: OpenAPI generator compatibility
description: Compatibility issues in the workspace OpenAPI client regeneration toolchain.
---

Treat generated API client output as suspect when code generation produces broad changes or compile errors unrelated to the endpoint being added. In this workspace, regeneration produced incompatible React Query/Zod output and `Headers.entries` typing failures; keep the generated diff only after it type-checks and matches the existing client conventions.

**Why:** a successful generator command did not mean the generated client was usable, and retaining its output would have introduced widespread unrelated breakage.

**How to apply:** after an OpenAPI change, inspect the generated diff and run the relevant type checks. If the toolchain is incompatible, avoid committing noisy generated changes and clearly isolate any temporary endpoint client.
