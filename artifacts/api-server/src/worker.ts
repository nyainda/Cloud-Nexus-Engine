import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Variables } from "./types";
import { hashPin } from "./lib/auth";
import { BOOTSTRAP_SQL } from "./lib/bootstrap-sql";
import router from "./routes";

const SHOP_A_ID = "shop-greenlink";
const SHOP_B_ID = "shop-sunrise";

let bootstrapped = false;

async function bootstrapD1(db: D1Database): Promise<void> {
  if (bootstrapped) return;

  const statements = BOOTSTRAP_SQL.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && (s.toUpperCase().startsWith("CREATE") || s.toUpperCase().startsWith("INSERT")));

  // Run all CREATE TABLE/INDEX statements as a single batched D1 request (faster cold start)
  try {
    await db.batch(statements.map((s) => db.prepare(s)));
  } catch {
    // Fallback: individual statements (handles tables that already exist)
    for (const stmt of statements) {
      try { await db.prepare(stmt).run(); } catch { /* already exists */ }
    }
  }

  const MIGRATIONS = [
    // Durable marker table: unlike the module-level bootstrapped flag, this
    // coordinates one-time work across all Cloudflare Worker isolates.
    "CREATE TABLE IF NOT EXISTS app_migrations (key TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
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
    "ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'",
    "ALTER TABLE debt_payments ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'payment'",
    "ALTER TABLE debt_payments ADD COLUMN reversal_of_id TEXT",
    "ALTER TABLE debt_payments ADD COLUMN note TEXT",
    "ALTER TABLE debts ADD COLUMN items_json TEXT",
    // D1 indexes — added after initial deployment; CREATE INDEX IF NOT EXISTS is idempotent
    "CREATE INDEX IF NOT EXISTS idx_products_shop_active ON products(shop_id, is_active)",
    "CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id)",
    "CREATE INDEX IF NOT EXISTS idx_products_shop_updated_at ON products(shop_id, updated_at)",
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
    // FTS5 virtual table for fast product search
    `CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
      id UNINDEXED,
      shop_id UNINDEXED,
      normalized_name,
      canonical_name,
      sku,
      category,
      content='products',
      content_rowid='rowid'
    )`,
    // Keep FTS in sync on insert
    `CREATE TRIGGER IF NOT EXISTS products_fts_insert AFTER INSERT ON products BEGIN
       INSERT INTO products_fts(rowid, id, shop_id, normalized_name, canonical_name, sku, category)
       VALUES (new.rowid, new.id, new.shop_id, new.normalized_name, new.canonical_name, COALESCE(new.sku,''), COALESCE(new.category,''));
     END`,
    // Keep FTS in sync on update
    `CREATE TRIGGER IF NOT EXISTS products_fts_update AFTER UPDATE ON products BEGIN
       INSERT INTO products_fts(products_fts, rowid, id, shop_id, normalized_name, canonical_name, sku, category)
       VALUES ('delete', old.rowid, old.id, old.shop_id, old.normalized_name, old.canonical_name, COALESCE(old.sku,''), COALESCE(old.category,''));
       INSERT INTO products_fts(rowid, id, shop_id, normalized_name, canonical_name, sku, category)
       VALUES (new.rowid, new.id, new.shop_id, new.normalized_name, new.canonical_name, COALESCE(new.sku,''), COALESCE(new.category,''));
     END`,
    // Keep FTS in sync on delete
    `CREATE TRIGGER IF NOT EXISTS products_fts_delete AFTER DELETE ON products BEGIN
       INSERT INTO products_fts(products_fts, rowid, id, shop_id, normalized_name, canonical_name, sku, category)
       VALUES ('delete', old.rowid, old.id, old.shop_id, old.normalized_name, old.canonical_name, COALESCE(old.sku,''), COALESCE(old.category,''));
     END`,
    // Customer returns table
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
    // Quotation builder feature
    "ALTER TABLE shops ADD COLUMN owner_name TEXT",
    "ALTER TABLE shops ADD COLUMN address TEXT",
    "ALTER TABLE shops ADD COLUMN email TEXT",
    `CREATE TABLE IF NOT EXISTS quotations (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      quote_number TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL DEFAULT '',
      customer_email TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      valid_until TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      items_json TEXT NOT NULL DEFAULT '[]',
      created_by TEXT,
      created_at TEXT NOT NULL
    )`,
    "CREATE INDEX IF NOT EXISTS idx_quotations_shop_date ON quotations(shop_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_quotations_shop_status ON quotations(shop_id, status)",
    // Customer accounts (CRM)
    `CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT,
      notes TEXT,
      credit_limit REAL,
      created_at TEXT NOT NULL
    )`,
    "CREATE INDEX IF NOT EXISTS idx_customers_shop ON customers(shop_id)",
    "CREATE INDEX IF NOT EXISTS idx_customers_shop_name ON customers(shop_id, name)",
    // FTS5 product search was replaced by the products-table LIKE search.
    // Remove the old virtual table and triggers so future cold starts cannot
    // recreate the write multiplier.
    "DROP TRIGGER IF EXISTS products_fts_insert",
    "DROP TRIGGER IF EXISTS products_fts_update",
    "DROP TRIGGER IF EXISTS products_fts_delete",
    "DROP TABLE IF EXISTS products_fts",
  ];
  for (const m of MIGRATIONS) {
    try { await db.prepare(m).run(); } catch { /* already exists or not applicable */ }
  }

  // ── Fix old quotations schema (has extra NOT NULL columns: type, customer_address, updated_at)
  // that break Drizzle inserts. Detect via PRAGMA table_info, then recreate correctly.
  try {
    const { results: colInfo } = await db.prepare("PRAGMA table_info(quotations)").all();
    const colNames = (colInfo as Array<{ name: string }>).map(c => c.name);
    const hasOldSchema = colNames.includes("updated_at") || colNames.includes("type") || colNames.includes("customer_address");
    if (hasOldSchema) {
      // Back up existing rows
      const { results: oldRows } = await db.prepare("SELECT * FROM quotations").all();
      // Recreate with correct schema via rename trick
      await db.prepare(`CREATE TABLE IF NOT EXISTS quotations_new (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL,
        quote_number TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL DEFAULT '',
        customer_email TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        notes TEXT,
        valid_until TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        discount_amount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        items_json TEXT NOT NULL DEFAULT '[]',
        created_by TEXT,
        created_at TEXT NOT NULL
      )`).run();
      // Migrate existing rows
      for (const q of (oldRows as any[])) {
        try {
          await db.prepare(`INSERT OR IGNORE INTO quotations_new
            (id,shop_id,quote_number,customer_name,customer_phone,customer_email,status,notes,valid_until,subtotal,discount_amount,total,items_json,created_by,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .bind(q.id, q.shop_id, q.quote_number, q.customer_name,
              q.customer_phone ?? "", q.customer_email ?? null, q.status ?? "draft",
              q.notes ?? null, q.valid_until ?? null, q.subtotal ?? 0,
              q.discount_amount ?? q.discount ?? 0, q.total ?? 0,
              q.items_json ?? "[]", q.created_by ?? null, q.created_at)
            .run();
        } catch { /* skip bad rows */ }
      }
      await db.prepare("DROP TABLE quotations").run();
      await db.prepare("ALTER TABLE quotations_new RENAME TO quotations").run();
      try { await db.prepare("CREATE INDEX IF NOT EXISTS idx_quotations_shop_date ON quotations(shop_id, created_at)").run(); } catch {}
      try { await db.prepare("CREATE INDEX IF NOT EXISTS idx_quotations_shop_status ON quotations(shop_id, status)").run(); } catch {}
    }
  } catch { /* quota table may not exist yet — safe to skip */ }

  const { results } = await db.prepare("SELECT COUNT(*) as n FROM shops").all();
  const shopCount = Number((results as Array<{ n: number }>)[0]?.n ?? 0);

  if (shopCount === 0) {
    const now = new Date().toISOString();
    const [ownerHash, cashierHash] = await Promise.all([hashPin("1234"), hashPin("5678")]);
    await db.prepare(
      `INSERT INTO shops (id, name, owner_pin_hash, cashier_pin_hash, owner_whatsapp, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(SHOP_A_ID, "GreenLink Farm Supplies", ownerHash, cashierHash, "+254700000000", now).run();
    await db.prepare(
      `INSERT INTO shops (id, name, owner_pin_hash, cashier_pin_hash, owner_whatsapp, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(SHOP_B_ID, "Sunrise Agrovet", ownerHash, cashierHash, null, now).run();
    // Default shops seeded — PINs intentionally omitted from logs
  }

  bootstrapped = true;
}

async function archiveOldSessions(db: D1Database): Promise<void> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  await db.prepare(
    "UPDATE scan_sessions SET archived_at = ? WHERE archived_at IS NULL AND created_at < ?"
  ).bind(now, cutoff).run();
}

// ── Monthly data pruning — keeps D1 under the free 5 GB limit indefinitely ──
// Strategy:
//   • Sales + sale_items + debts + debt_payments → NEVER deleted (financial records)
//   • audit_log          → keep 365 days  (compliance window)
//   • notifications      → keep 180 days read, 365 days unread
//   • inventory_movements→ keep 2 years
//   • price_history      → keep 2 years
//   • scan_sessions      → hard-delete archived ones after 90 days
//   • quotations         → delete rejected/expired after 180 days
//   • push_subscriptions → delete stale endpoints after 365 days
async function pruneOldData(db: D1Database): Promise<Record<string, number>> {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const ago = (days: number) => new Date(now - days * day).toISOString();

  const results: Record<string, number> = {};

  const steps: Array<{ name: string; sql: string; params: string[] }> = [
    {
      name: "audit_log",
      sql: "DELETE FROM audit_log WHERE created_at < ?",
      params: [ago(365)],
    },
    {
      name: "notifications_read",
      sql: "DELETE FROM notifications WHERE is_read = 1 AND created_at < ?",
      params: [ago(180)],
    },
    {
      name: "notifications_old",
      sql: "DELETE FROM notifications WHERE created_at < ?",
      params: [ago(365)],
    },
    {
      name: "inventory_movements",
      sql: "DELETE FROM inventory_movements WHERE created_at < ?",
      params: [ago(730)],
    },
    {
      name: "price_history",
      sql: "DELETE FROM price_history WHERE changed_at < ? AND changed_at != ''",
      params: [ago(730)],
    },
    {
      name: "scan_sessions",
      sql: "DELETE FROM scan_sessions WHERE archived_at IS NOT NULL AND created_at < ?",
      params: [ago(90)],
    },
    {
      name: "quotations_expired",
      sql: "DELETE FROM quotations WHERE status IN ('rejected','expired') AND created_at < ?",
      params: [ago(180)],
    },
    {
      name: "push_subscriptions",
      sql: "DELETE FROM push_subscriptions WHERE created_at < ?",
      params: [ago(365)],
    },
  ];

  for (const step of steps) {
    try {
      const r = await db.prepare(step.sql).bind(...step.params).run();
      results[step.name] = r.meta?.changes ?? 0;
    } catch (err) {
      console.error(`[prune] ${step.name} failed:`, err);
      results[step.name] = -1;
    }
  }

  return results;
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// CORS is intentionally open (*) — the Worker is called from Replit dev proxy,
// Vercel frontend, and the installed PWA (which has no predictable origin).
// All sensitive routes are protected by Bearer token auth middleware.
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

app.use("*", async (c, next) => {
  try { await bootstrapD1(c.env.DB); } catch (err) { console.error("[boot] error:", err); }
  await next();
  if (c.req.method === "GET") {
    const urlPath = new URL(c.req.url).pathname;
    const isPublic = urlPath === "/api/shops" || urlPath.startsWith("/api/healthz");
    if (isPublic) {
      c.res.headers.set("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
    } else if (c.res.status < 400) {
      c.res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
    }
  } else {
    c.res.headers.set("Cache-Control", "no-store");
  }
});

app.onError((err, c) => {
  console.error("[error]", c.req.method, new URL(c.req.url).pathname, err?.message ?? err);
  return c.json({ error: "Internal server error", message: err?.message ?? "Unknown error" }, 500);
});

app.route("/api", router);
app.all("*", (c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch.bind(app),
  async scheduled(_ctrl: ScheduledController, env: Env, _ctx: ExecutionContext) {
    try { await archiveOldSessions(env.DB); } catch (err) { console.error("[cron] archive:", err); }
    try {
      const pruned = await pruneOldData(env.DB);
      console.log("[cron] prune complete:", JSON.stringify(pruned));
    } catch (err) {
      console.error("[cron] prune failed:", err);
    }
  },
};
