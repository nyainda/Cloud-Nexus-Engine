/**
 * Node.js development server for Replit.
 * Adapts the Cloudflare Worker app to run locally using:
 *  - better-sqlite3 as a D1Database shim
 *  - An in-memory Map as a KVNamespace shim
 *  - @hono/node-server as the HTTP runtime
 */

import { serve } from "@hono/node-server";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Variables } from "./types";
import { hashPin } from "./lib/auth";
import { BOOTSTRAP_SQL } from "./lib/bootstrap-sql";
import router from "./routes";

// ── Data directory ──────────────────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "greenlink.db");

// ── SQLite → D1Database shim ────────────────────────────────────────────────
function makeD1(sqliteDb: Database.Database): D1Database {
  function runStatement(sql: string, params: unknown[]): D1PreparedStatement {
    return {
      bind(...args: unknown[]) {
        return runStatement(sql, args);
      },
      async run() {
        try {
          const stmt = sqliteDb.prepare(sql);
          const info = stmt.run(...(params as any[]));
          return {
            success: true,
            meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
            results: [],
          } as any;
        } catch (err) {
          throw err;
        }
      },
      async first<T = unknown>(col?: string) {
        const stmt = sqliteDb.prepare(sql);
        const row = stmt.get(...(params as any[])) as any;
        if (col !== undefined) return row ? row[col] : null;
        return (row ?? null) as T | null;
      },
      async all<T = unknown>() {
        const stmt = sqliteDb.prepare(sql);
        const rows = stmt.all(...(params as any[])) as T[];
        return { success: true, results: rows, meta: {} } as any;
      },
      async raw<T = unknown[]>() {
        const stmt = sqliteDb.prepare(sql);
        const rows = (stmt.all(...(params as any[])) as any[]).map((r) => Object.values(r));
        return rows as T[];
      },
    } as D1PreparedStatement;
  }

  const d1: D1Database = {
    prepare(sql: string) {
      return runStatement(sql, []);
    },
    async batch(statements: D1PreparedStatement[]) {
      const results: any[] = [];
      for (const stmt of statements) {
        try {
          results.push(await (stmt as any).run());
        } catch {
          results.push({ success: false, results: [], meta: {} });
        }
      }
      return results;
    },
    async dump() {
      return new ArrayBuffer(0);
    },
    async exec(sql: string) {
      const stmts = sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      let count = 0;
      for (const s of stmts) {
        try {
          sqliteDb.prepare(s).run();
          count++;
        } catch {
          /* skip errors */
        }
      }
      return { count, duration: 0 } as D1ExecResult;
    },
  };
  return d1;
}

// ── KVNamespace shim (in-memory with TTL) ──────────────────────────────────
interface KVEntry { value: string; exp: number | null }

function makeKV(): KVNamespace {
  const store = new Map<string, KVEntry>();

  function isExpired(entry: KVEntry) {
    return entry.exp !== null && Date.now() > entry.exp;
  }

  return {
    async get(key: string) {
      const entry = store.get(key);
      if (!entry || isExpired(entry)) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number; expiration?: number }) {
      let exp: number | null = null;
      if (opts?.expirationTtl) exp = Date.now() + opts.expirationTtl * 1000;
      else if (opts?.expiration) exp = opts.expiration * 1000;
      store.set(key, { value, exp });
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list(opts?: any) {
      const prefix = opts?.prefix ?? "";
      const keys = [...store.entries()]
        .filter(([k, v]) => k.startsWith(prefix) && !isExpired(v))
        .map(([k]) => ({ name: k }));
      return { keys, list_complete: true, cursor: "" } as any;
    },
    async getWithMetadata(key: string) {
      const val = await (this as any).get(key);
      return { value: val, metadata: null } as any;
    },
  } as unknown as KVNamespace;
}

// ── Bootstrap DB (same logic as worker.ts but via better-sqlite3) ──────────
const SHOP_A_ID = "shop-greenlink";
const SHOP_B_ID = "shop-sunrise";

async function bootstrapSqlite(db: Database.Database, kv: KVNamespace): Promise<void> {
  // Run CREATE TABLE statements
  const statements = BOOTSTRAP_SQL.split(";")
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length > 0 &&
        (s.toUpperCase().startsWith("CREATE") || s.toUpperCase().startsWith("INSERT")),
    );
  for (const stmt of statements) {
    try {
      db.prepare(stmt).run();
    } catch {
      /* already exists */
    }
  }

  const MIGRATIONS = [
    "ALTER TABLE scan_sessions ADD COLUMN image_url TEXT",
    "ALTER TABLE scan_sessions ADD COLUMN r2_key TEXT",
    "ALTER TABLE scan_sessions ADD COLUMN archived_at TEXT",
    "ALTER TABLE price_history ADD COLUMN changed_at TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE price_history ADD COLUMN created_at TEXT",
    "ALTER TABLE shops ADD COLUMN gemini_api_key TEXT",
    "ALTER TABLE shops ADD COLUMN groq_api_key TEXT",
    "ALTER TABLE products ADD COLUMN expiry_date TEXT",
    "ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'normal'",
    "ALTER TABLE products ADD COLUMN allow_decimals INTEGER NOT NULL DEFAULT 0",
    "CREATE INDEX IF NOT EXISTS idx_products_shop_active ON products(shop_id, is_active)",
    "CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id)",
    "CREATE INDEX IF NOT EXISTS idx_sales_shop_date ON sales(shop_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)",
    "CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id)",
    "CREATE INDEX IF NOT EXISTS idx_debts_shop_status ON debts(shop_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_debts_shop_date ON debts(shop_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON debt_payments(debt_id)",
    "CREATE INDEX IF NOT EXISTS idx_inventory_product_date ON inventory_movements(product_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_notifications_shop_read ON notifications(shop_id, is_read)",
    "CREATE INDEX IF NOT EXISTS idx_notifications_shop_date ON notifications(shop_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_audit_shop_date ON audit_log(shop_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id)",
    "CREATE INDEX IF NOT EXISTS idx_product_aliases_product ON product_aliases(product_id)",
    "CREATE INDEX IF NOT EXISTS idx_suppliers_shop ON suppliers(shop_id)",
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      keys_p256dh TEXT NOT NULL,
      keys_auth TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sale_returns (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      sale_id TEXT NOT NULL,
      items_json TEXT NOT NULL,
      total_refund REAL NOT NULL,
      reason TEXT,
      processed_by TEXT,
      created_at TEXT NOT NULL
    )`,
    "CREATE INDEX IF NOT EXISTS idx_sale_returns_sale ON sale_returns(sale_id)",
    "CREATE INDEX IF NOT EXISTS idx_sale_returns_shop ON sale_returns(shop_id, created_at)",
    "ALTER TABLE scan_sessions ADD COLUMN supplier_id TEXT",
    "CREATE INDEX IF NOT EXISTS idx_scan_sessions_supplier ON scan_sessions(supplier_id)",
    "CREATE INDEX IF NOT EXISTS idx_scan_sessions_shop_date ON scan_sessions(shop_id, created_at)",
  ];
  for (const m of MIGRATIONS) {
    try {
      db.prepare(m).run();
    } catch {
      /* already exists or not applicable */
    }
  }

  // Seed default shops if none exist
  const count = (db.prepare("SELECT COUNT(*) as n FROM shops").get() as any)?.n ?? 0;
  if (count === 0) {
    const now = new Date().toISOString();
    const [ownerHash, cashierHash] = await Promise.all([hashPin("1234"), hashPin("5678")]);
    db.prepare(
      `INSERT INTO shops (id, name, owner_pin_hash, cashier_pin_hash, owner_whatsapp, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(SHOP_A_ID, "GreenLink Farm Supplies", ownerHash, cashierHash, "+254700000000", now);
    db.prepare(
      `INSERT INTO shops (id, name, owner_pin_hash, cashier_pin_hash, owner_whatsapp, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(SHOP_B_ID, "Sunrise Agrovet", ownerHash, cashierHash, null, now);
    console.log("[boot] Seeded default shops (owner PIN: 1234, cashier PIN: 5678)");
  }
}

// ── Build the Hono app with local bindings ─────────────────────────────────
async function createApp() {
  const sqliteDb = new Database(DB_PATH);
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.pragma("foreign_keys = ON");

  const d1 = makeD1(sqliteDb);
  const kv = makeKV();

  await bootstrapSqlite(sqliteDb, kv);

  const env: Env = {
    DB: d1,
    SESSIONS: kv,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    AI_INTEGRATIONS_GEMINI_API_KEY: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
    AI_INTEGRATIONS_GEMINI_BASE_URL: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY_JWK: process.env.VAPID_PRIVATE_KEY_JWK,
    NODE_ENV: process.env.NODE_ENV ?? "development",
    DATA_DIR,
  } as any;

  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );

  // Inject local env bindings into every request context
  app.use("*", async (c, next) => {
    Object.assign(c.env, env);
    await next();
  });

  app.onError((err, c) => {
    console.error("[error]", c.req.method, new URL(c.req.url).pathname, err?.message ?? err);
    return c.json({ error: "Internal server error", message: err?.message ?? "Unknown error" }, 500);
  });

  app.route("/api", router);
  app.all("*", (c) => c.json({ error: "Not found" }, 404));

  return app;
}

// ── Start server ───────────────────────────────────────────────────────────
const PORT = parseInt(process.env.API_PORT ?? "8080", 10);

createApp().then((app) => {
  serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" });
  console.log(`[api] GreenLink API server running on http://0.0.0.0:${PORT}`);
  console.log(`[api] Database: ${DB_PATH}`);
});
