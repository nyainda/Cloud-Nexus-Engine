import { Hono } from "hono";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { sales, saleItems, products, debts, debtPayments, notifications } from "@workspace/db/schema";
import { kvGet, kvSet, CK, CACHE_TTL } from "../lib/cache";

const reportsRouter = new Hono<AppEnv>();

reportsRouter.get("/reports/dashboard", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId") ?? null;
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);

  // ── KV cache (5 min TTL, busted on every sale or debt payment) ──────────────
  if (shopId) {
    const ck = CK.dashboard(shopId, date);
    const cached = await kvGet<object>(c.env.SESSIONS, ck);
    if (cached) return c.json(cached);
  }
  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay = `${date}T23:59:59.999Z`;

  // All reads are independent — fire them in parallel to cut CPU time ~5×
  const [daySales, lowStockRow, outOfStockRow, pendingDebts, unreadNotifications, itemsSold, cashCollectedRow] = await Promise.all([
    db.select().from(sales).where(
      and(
        shopId ? eq(sales.shopId, shopId) : undefined,
        eq(sales.isDeleted, false),
        gte(sales.createdAt, startOfDay),
        lte(sales.createdAt, endOfDay),
      ),
    ).all(),
    // Count low-stock products in SQL — avoids fetching all 2600+ rows just to count
    db.select({ count: sql<number>`COUNT(*)` }).from(products).where(
      and(
        shopId ? eq(products.shopId, shopId) : undefined,
        sql`is_active = 1 AND stock_qty > 0 AND stock_qty <= alert_qty`,
      ),
    ).get(),
    db.select({ count: sql<number>`COUNT(*)` }).from(products).where(
      and(
        shopId ? eq(products.shopId, shopId) : undefined,
        sql`is_active = 1 AND stock_qty = 0`,
      ),
    ).get(),
    db.select().from(debts).where(
      and(shopId ? eq(debts.shopId, shopId) : undefined, sql`status != 'paid'`),
    ).all(),
    db.select().from(notifications).where(
      and(shopId ? eq(notifications.shopId, shopId) : undefined, eq(notifications.isRead, false)),
    ).all(),
    db.select().from(saleItems).where(
      sql`sale_id IN (SELECT id FROM sales WHERE is_deleted = 0 AND created_at >= ${startOfDay} AND created_at <= ${endOfDay}${shopId ? sql` AND shop_id = ${shopId}` : sql``})`,
    ).all(),
    db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` }).from(debtPayments).where(
      sql`paid_at >= ${startOfDay} AND paid_at <= ${endOfDay}${shopId ? sql` AND debt_id IN (SELECT id FROM debts WHERE shop_id = ${shopId})` : sql``}`,
    ).get(),
  ]);

  const totalRevenue = daySales.reduce((s, sale) => s + sale.totalAmount, 0);
  const totalCost = daySales.reduce((s, sale) => s + (sale.totalCost ?? 0), 0);
  const totalProfit = daySales.reduce((s, sale) => s + (sale.totalProfit ?? 0), 0);
  const cashSales = daySales.filter((s) => s.saleType === "cash").reduce((sum, s) => sum + s.totalAmount, 0);
  const debtSales = daySales.filter((s) => s.saleType === "debt").reduce((sum, s) => sum + s.totalAmount, 0);

  const lowStockCount = lowStockRow?.count ?? 0;
  const outOfStockCount = outOfStockRow?.count ?? 0;
  const pendingDebtsTotal = pendingDebts.reduce((s, d) => s + d.balance, 0);

  const productSales = new Map<string, { productId: string; productName: string; totalQtySold: number; totalRevenue: number; totalProfit: number | null }>();
  for (const item of itemsSold) {
    const key = item.productId ?? item.productName;
    const existing = productSales.get(key);
    if (existing) {
      existing.totalQtySold += item.qty;
      existing.totalRevenue += item.totalPrice;
      existing.totalProfit = (existing.totalProfit ?? 0) + (item.totalProfit ?? 0);
    } else {
      productSales.set(key, {
        productId: item.productId ?? key,
        productName: item.productName,
        totalQtySold: item.qty,
        totalRevenue: item.totalPrice,
        totalProfit: item.totalProfit,
      });
    }
  }
  const topProducts = Array.from(productSales.values())
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 5);

  const cashCollectedToday = cashCollectedRow?.total ?? 0;

  const dashPayload = {
    date,
    shopId,
    totalRevenue,
    totalProfit,
    totalCost,
    salesCount: daySales.length,
    marginPct: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    cashSales,
    debtSales,
    cashCollectedToday,
    topProducts,
    lowStockCount,
    outOfStockCount,
    pendingDebtsTotal,
    unreadNotificationsCount: unreadNotifications.length,
  };
  if (shopId) {
    await kvSet(c.env.SESSIONS, CK.dashboard(shopId, date), dashPayload, CACHE_TTL.dashboard);
  }
  return c.json(dashPayload);
});

reportsRouter.get("/reports/range", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId") ?? null;
  const from = c.req.query("from")!;
  const to = c.req.query("to")!;

  const fromTs = `${from}T00:00:00.000Z`;
  const toTs = `${to}T23:59:59.999Z`;

  const [rangeSales, cashCollectedRow] = await Promise.all([
    db.select().from(sales).where(
      and(
        shopId ? eq(sales.shopId, shopId) : undefined,
        eq(sales.isDeleted, false),
        gte(sales.createdAt, fromTs),
        lte(sales.createdAt, toTs),
      ),
    ).all(),
    db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` }).from(debtPayments).where(
      sql`paid_at >= ${fromTs} AND paid_at <= ${toTs}${shopId ? sql` AND debt_id IN (SELECT id FROM debts WHERE shop_id = ${shopId})` : sql``}`,
    ).get(),
  ]);

  const totalRevenue = rangeSales.reduce((s, sale) => s + sale.totalAmount, 0);
  const totalCost = rangeSales.reduce((s, sale) => s + (sale.totalCost ?? 0), 0);
  const totalProfit = rangeSales.reduce((s, sale) => s + (sale.totalProfit ?? 0), 0);
  const cashSales = rangeSales.filter((s) => s.saleType === "cash").reduce((sum, s) => sum + s.totalAmount, 0);
  const debtSales = rangeSales.filter((s) => s.saleType === "debt").reduce((sum, s) => sum + s.totalAmount, 0);
  const cashCollected = cashCollectedRow?.total ?? 0;

  const dailyMap = new Map<string, { date: string; revenue: number; profit: number; salesCount: number }>();
  for (const sale of rangeSales) {
    const day = sale.createdAt.slice(0, 10);
    const existing = dailyMap.get(day);
    if (existing) {
      existing.revenue += sale.totalAmount;
      existing.profit += sale.totalProfit ?? 0;
      existing.salesCount++;
    } else {
      dailyMap.set(day, { date: day, revenue: sale.totalAmount, profit: sale.totalProfit ?? 0, salesCount: 1 });
    }
  }

  return c.json({
    from,
    to,
    shopId,
    totalRevenue,
    totalProfit,
    totalCost,
    salesCount: rangeSales.length,
    marginPct: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    cashSales,
    debtSales,
    cashCollected,
    dailyBreakdown: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
  });
});

reportsRouter.get("/reports/top-products", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId") ?? null;
  const from = c.req.query("from");
  const to = c.req.query("to");
  const limit = parseInt(c.req.query("limit") ?? "10");

  const fromTs = from ? `${from}T00:00:00.000Z` : "2020-01-01T00:00:00.000Z";
  const toTs = to ? `${to}T23:59:59.999Z` : new Date().toISOString();

  const items = await db
    .select()
    .from(saleItems)
    .where(
      sql`sale_id IN (SELECT id FROM sales WHERE is_deleted = 0 AND created_at >= ${fromTs} AND created_at <= ${toTs}${shopId ? sql` AND shop_id = ${shopId}` : sql``})`,
    )
    .all();

  const map = new Map<string, { productId: string; productName: string; totalQtySold: number; totalRevenue: number; totalProfit: number | null }>();
  for (const item of items) {
    const key = item.productId ?? item.productName;
    const existing = map.get(key);
    if (existing) {
      existing.totalQtySold += item.qty;
      existing.totalRevenue += item.totalPrice;
      existing.totalProfit = (existing.totalProfit ?? 0) + (item.totalProfit ?? 0);
    } else {
      map.set(key, {
        productId: item.productId ?? key,
        productName: item.productName,
        totalQtySold: item.qty,
        totalRevenue: item.totalPrice,
        totalProfit: item.totalProfit,
      });
    }
  }

  return c.json(
    Array.from(map.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit),
  );
});

reportsRouter.get("/reports/category-breakdown", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId") ?? null;
  const from = c.req.query("from");
  const to = c.req.query("to");

  const fromTs = from ? `${from}T00:00:00.000Z` : "2020-01-01T00:00:00.000Z";
  const toTs = to ? `${to}T23:59:59.999Z` : new Date().toISOString();

  const [items, allProducts] = await Promise.all([
    db.select().from(saleItems).where(
      sql`sale_id IN (SELECT id FROM sales WHERE is_deleted = 0 AND created_at >= ${fromTs} AND created_at <= ${toTs}${shopId ? sql` AND shop_id = ${shopId}` : sql``})`,
    ).all(),
    db.select().from(products).where(shopId ? eq(products.shopId, shopId) : undefined).all(),
  ]);
  const productCategoryMap = new Map(allProducts.map((p) => [p.id, p.category ?? "Uncategorized"]));
  const productNameMap = new Map(allProducts.map((p) => [p.id, p.canonicalName ?? p.id]));

  type ProdEntry = { productId: string; productName: string; qtySold: number; totalRevenue: number; totalProfit: number };
  type CatEntry = { category: string; totalRevenue: number; totalProfit: number; salesCount: number; products: Map<string, ProdEntry> };
  const map = new Map<string, CatEntry>();

  for (const item of items) {
    const category = (item.productId ? productCategoryMap.get(item.productId) : null) ?? "Uncategorized";
    const productName = (item.productId ? productNameMap.get(item.productId) : null) ?? item.productName ?? "Unknown";
    const productKey = item.productId ?? productName;

    let catEntry = map.get(category);
    if (!catEntry) {
      catEntry = { category, totalRevenue: 0, totalProfit: 0, salesCount: 0, products: new Map() };
      map.set(category, catEntry);
    }
    catEntry.totalRevenue += item.totalPrice;
    catEntry.totalProfit += item.totalProfit ?? 0;
    catEntry.salesCount += item.qty;

    let prodEntry = catEntry.products.get(productKey);
    if (!prodEntry) {
      prodEntry = { productId: item.productId ?? "", productName, qtySold: 0, totalRevenue: 0, totalProfit: 0 };
      catEntry.products.set(productKey, prodEntry);
    }
    prodEntry.qtySold += item.qty;
    prodEntry.totalRevenue += item.totalPrice;
    prodEntry.totalProfit += item.totalProfit ?? 0;
  }

  return c.json(
    Array.from(map.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .map(cat => ({
        category: cat.category,
        totalRevenue: cat.totalRevenue,
        totalProfit: cat.totalProfit,
        salesCount: cat.salesCount,
        products: Array.from(cat.products.values()).sort((a, b) => b.totalRevenue - a.totalRevenue),
      }))
  );
});

reportsRouter.get("/reports/hourly", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId") ?? null;
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay = `${date}T23:59:59.999Z`;

  const daySales = await db
    .select()
    .from(sales)
    .where(
      and(
        shopId ? eq(sales.shopId, shopId) : undefined,
        eq(sales.isDeleted, false),
        gte(sales.createdAt, startOfDay),
        lte(sales.createdAt, endOfDay),
      ),
    )
    .all();

  const hourMap = new Map<number, { hour: number; salesCount: number; revenue: number }>();
  for (let h = 0; h < 24; h++) hourMap.set(h, { hour: h, salesCount: 0, revenue: 0 });
  for (const sale of daySales) {
    const hour = parseInt(sale.createdAt.slice(11, 13));
    const entry = hourMap.get(hour)!;
    entry.salesCount++;
    entry.revenue += sale.totalAmount;
  }

  return c.json(Array.from(hourMap.values()));
});

reportsRouter.get("/reports/debts-summary", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId") ?? null;

  const allDebts = await db
    .select()
    .from(debts)
    .where(shopId ? eq(debts.shopId, shopId) : undefined)
    .all();

  const unpaid = allDebts.filter((d) => d.status === "unpaid");
  const partial = allDebts.filter((d) => d.status === "partial");

  return c.json({
    totalOutstanding: unpaid.reduce((s, d) => s + d.balance, 0) + partial.reduce((s, d) => s + d.balance, 0),
    totalUnpaid: unpaid.reduce((s, d) => s + d.totalAmount, 0),
    totalPartial: partial.reduce((s, d) => s + d.balance, 0),
    unpaidCount: unpaid.length,
    partialCount: partial.length,
  });
});

// ── Product sales search ──────────────────────────────────────────────────────
// Search by product name across sale_items. Returns each matching variant as
// its own row plus a combined summary so the user can see "Roundup 500ml" and
// "Roundup 1L" individually AND their combined revenue/profit/qty total.
reportsRouter.get("/reports/product-search", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId") ?? null;
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const from = c.req.query("from");
  const to = c.req.query("to");

  if (!q || q.length < 2) {
    return c.json({ query: q, variants: [], summary: null });
  }

  const fromTs = from ? `${from}T00:00:00.000Z` : "2020-01-01T00:00:00.000Z";
  const toTs   = to   ? `${to}T23:59:59.999Z`   : new Date().toISOString();

  // 1. Find all products whose canonical/normalized name contains the query
  //    so we can also match by productId (catches name changes after the sale)
  const matchingProducts = await db
    .select({ id: products.id, canonicalName: products.canonicalName, category: products.category })
    .from(products)
    .where(
      shopId
        ? and(eq(products.shopId, shopId), sql`lower(canonical_name) LIKE ${"%" + q + "%"}`)
        : sql`lower(canonical_name) LIKE ${"%" + q + "%"}`,
    )
    .all();

  const matchingProductIds = new Set(matchingProducts.map((p) => p.id));
  const canonicalNameById  = new Map(matchingProducts.map((p) => [p.id, p.canonicalName]));
  const categoryById       = new Map(matchingProducts.map((p) => [p.id, p.category ?? "Uncategorized"]));

  // 2. Pull all sale_items in the date range that match either by productId or productName
  const items = await db
    .select()
    .from(saleItems)
    .where(
      sql`sale_id IN (
        SELECT id FROM sales
        WHERE is_deleted = 0
          AND created_at >= ${fromTs}
          AND created_at <= ${toTs}
          ${shopId ? sql`AND shop_id = ${shopId}` : sql``}
      )`,
    )
    .all();

  // 3. Keep only items that match the query (by productId OR productName substring)
  const matched = items.filter(
    (item) =>
      (item.productId && matchingProductIds.has(item.productId)) ||
      item.productName.toLowerCase().includes(q),
  );

  // 4. Group by (productId → canonicalName) so same product sold under old/new
  //    names still merges correctly. Fall back to productName when no productId.
  type Variant = {
    productId: string;
    productName: string;
    category: string;
    totalQty: number;
    totalRevenue: number;
    totalProfit: number;
    salesCount: number;
  };

  const variantMap = new Map<string, Variant>();

  for (const item of matched) {
    const key          = item.productId ?? item.productName;
    const displayName  = item.productId
      ? (canonicalNameById.get(item.productId) ?? item.productName)
      : item.productName;
    const category     = item.productId
      ? (categoryById.get(item.productId) ?? "Uncategorized")
      : "Uncategorized";

    const existing = variantMap.get(key);
    if (existing) {
      existing.totalQty     += item.qty;
      existing.totalRevenue += item.totalPrice;
      existing.totalProfit  += item.totalProfit ?? 0;
      existing.salesCount   += 1;
    } else {
      variantMap.set(key, {
        productId:    item.productId ?? key,
        productName:  displayName,
        category,
        totalQty:     item.qty,
        totalRevenue: item.totalPrice,
        totalProfit:  item.totalProfit ?? 0,
        salesCount:   1,
      });
    }
  }

  const variants = Array.from(variantMap.values()).sort(
    (a, b) => b.totalRevenue - a.totalRevenue,
  );

  const summary = variants.length === 0 ? null : {
    totalQty:     variants.reduce((s, v) => s + v.totalQty, 0),
    totalRevenue: variants.reduce((s, v) => s + v.totalRevenue, 0),
    totalProfit:  variants.reduce((s, v) => s + v.totalProfit, 0),
    salesCount:   variants.reduce((s, v) => s + v.salesCount, 0),
  };

  return c.json({ query: q, from: fromTs, to: toTs, variants, summary });
});

export default reportsRouter;
