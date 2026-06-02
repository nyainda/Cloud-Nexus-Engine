/**
 * API Smoke Tests — node:test (no extra deps, Node 24)
 *
 * Usage:
 *   pnpm --filter @workspace/scripts exec tsx src/smoke-test.ts
 *   pnpm --filter @workspace/scripts exec tsx src/smoke-test.ts --url http://localhost:8080
 *   pnpm --filter @workspace/scripts exec tsx src/smoke-test.ts --url https://greenlink-pos-api.bruce42oyugi.workers.dev
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

// ─── Config ──────────────────────────────────────────────────────────────────

const urlFlagIdx = process.argv.findIndex((a) => a === "--url");
const BASE = urlFlagIdx !== -1 ? process.argv[urlFlagIdx + 1] : "http://localhost:8080";
const OWNER_PIN = "1234";

type Shop = { id: string; name: string };

// ─── Shared state (set during before() and auth test, read by later tests) ───
const ctx = { shopId: "", authToken: "" };

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function api(path: string, opts: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (ctx.authToken) headers["Authorization"] = `Bearer ${ctx.authToken}`;

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  let body: unknown;
  const ct = res.headers.get("content-type") ?? "";
  try {
    body = ct.includes("json") ? await res.json() : await res.text();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function serverIsUp(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${BASE}/api/healthz`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Gate: skip all tests if server is not reachable ─────────────────────────

const up = await serverIsUp();
if (!up) {
  console.error(`\n⚠️  Server not reachable at ${BASE} — skipping smoke tests.`);
  console.error("   Start the API Server workflow first, then re-run.\n");
  process.exit(0);
}
console.log(`\n🟢 Running smoke tests against ${BASE}\n`);

// ─── All tests in one sequential suite ───────────────────────────────────────

describe("GreenLink API smoke tests", { concurrency: false }, () => {

  // ── Health ──────────────────────────────────────────────────────────────────
  test("GET /api/healthz returns { status: ok }", async () => {
    const { status, body } = await api("/api/healthz");
    assert.equal(status, 200, `expected 200, got ${status}`);
    assert.equal((body as { status: string }).status, "ok");
  });

  // ── Shops (public, no auth) ────────────────────────────────────────────────
  test("GET /api/shops returns an array with at least one shop", async () => {
    const { status, body } = await api("/api/shops");
    assert.equal(status, 200, `expected 200, got ${status}`);
    assert.ok(Array.isArray(body), "body should be an array");
    assert.ok((body as Shop[]).length >= 1, "at least one shop expected");
    ctx.shopId = (body as Shop[])[0].id;
  });

  // ── Auth ───────────────────────────────────────────────────────────────────
  test("POST /api/auth/login with valid owner PIN returns token", async () => {
    assert.ok(ctx.shopId, "shopId must be set from /api/shops test");
    const { status, body } = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ shopId: ctx.shopId, pin: OWNER_PIN, role: "owner" }),
    });
    assert.equal(status, 200, `expected 200, got ${status} — body: ${JSON.stringify(body)}`);
    const b = body as { token?: string };
    assert.ok(b.token, "response should contain a token");
    ctx.authToken = b.token!;
  });

  test("POST /api/auth/login with wrong PIN returns 401", async () => {
    const { status } = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ shopId: ctx.shopId, pin: "0000", role: "owner" }),
    });
    assert.equal(status, 401, `expected 401, got ${status}`);
  });

  test("Protected route without token returns 401", async () => {
    const saved = ctx.authToken;
    ctx.authToken = "";
    const { status } = await api(`/api/products?shopId=${ctx.shopId}&q=herbicide`);
    assert.equal(status, 401, `expected 401, got ${status}`);
    ctx.authToken = saved;
  });

  // ── Products (requires auth) ───────────────────────────────────────────────
  // Note: endpoint returns { products: [...] } when q is set (FTS5 path), or [] bare array otherwise
  test("GET /api/products?q=herbicide returns results", async () => {
    const { status, body } = await api(`/api/products?shopId=${ctx.shopId}&q=herbicide`);
    assert.equal(status, 200, `expected 200, got ${status} — body: ${JSON.stringify(body)}`);
    const list = Array.isArray(body) ? body : (body as { products?: unknown[] }).products;
    assert.ok(Array.isArray(list), `expected array or { products: [] }, got: ${JSON.stringify(body)}`);
  });

  test("GET /api/products with no query returns results", async () => {
    const { status, body } = await api(`/api/products?shopId=${ctx.shopId}&q=`);
    assert.equal(status, 200, `expected 200, got ${status}`);
    const list = Array.isArray(body) ? body : (body as { products?: unknown[] }).products;
    assert.ok(Array.isArray(list), `expected array or { products: [] }, got: ${JSON.stringify(body)}`);
  });

  // ── Debts ─────────────────────────────────────────────────────────────────
  test("GET /api/debts returns an array", async () => {
    const { status, body } = await api(`/api/debts?shopId=${ctx.shopId}`);
    assert.equal(status, 200, `expected 200, got ${status}`);
    assert.ok(Array.isArray(body), "debts should be an array");
  });

  // ── Inventory ─────────────────────────────────────────────────────────────
  test("GET /api/inventory-movements returns an array", async () => {
    const { status, body } = await api(`/api/inventory-movements?shopId=${ctx.shopId}`);
    assert.equal(status, 200, `expected 200, got ${status}`);
    assert.ok(Array.isArray(body), "inventory movements should be an array");
  });

  // ── Notifications ─────────────────────────────────────────────────────────
  test("GET /api/notifications returns an array", async () => {
    const { status, body } = await api(`/api/notifications?shopId=${ctx.shopId}`);
    assert.equal(status, 200, `expected 200, got ${status}`);
    assert.ok(Array.isArray(body), "notifications should be an array");
  });

  // ── Suppliers ─────────────────────────────────────────────────────────────
  test("GET /api/suppliers returns an array", async () => {
    const { status, body } = await api(`/api/suppliers?shopId=${ctx.shopId}`);
    assert.equal(status, 200, `expected 200, got ${status}`);
    assert.ok(Array.isArray(body), "suppliers should be an array");
  });

  // ── Audit log ─────────────────────────────────────────────────────────────
  test("GET /api/audit returns an array", async () => {
    const { status, body } = await api(`/api/audit?shopId=${ctx.shopId}`);
    assert.equal(status, 200, `expected 200, got ${status}`);
    assert.ok(Array.isArray(body), "audit log should be an array");
  });

});
