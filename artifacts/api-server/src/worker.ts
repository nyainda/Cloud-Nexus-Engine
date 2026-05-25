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
    "ALTER TABLE price_history ADD COLUMN changed_at TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE price_history ADD COLUMN created_at TEXT",
    "ALTER TABLE shops ADD COLUMN gemini_api_key TEXT",
    "ALTER TABLE products ADD COLUMN expiry_date TEXT",
    // D1 indexes — added after initial deployment; CREATE INDEX IF NOT EXISTS is idempotent
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
    // Populate FTS from existing products
    `INSERT OR IGNORE INTO products_fts(rowid, id, shop_id, normalized_name, canonical_name, sku, category)
     SELECT rowid, id, shop_id, normalized_name, canonical_name, COALESCE(sku,''), COALESCE(category,'')
     FROM products WHERE is_active = 1`,
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
  ];
  for (const m of MIGRATIONS) {
    try { await db.prepare(m).run(); } catch { /* already exists or not applicable */ }
  }

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
    console.log("[boot] Default shops created — Owner PIN: 1234 | Cashier PIN: 5678");
  }

  bootstrapped = true;
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

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

export default app;
