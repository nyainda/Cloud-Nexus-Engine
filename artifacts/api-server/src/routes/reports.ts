import { Hono } from "hono";
import { eq, and, gte, lte, sql, inArray, or } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { sales, saleItems, products, debts, debtPayments, notifications } from "@workspace/db/schema";
import { kvGet, kvSet, CK, CACHE_TTL } from "../lib/cache";
import { chunk } from "../lib/chunk";

const reportsRouter = new Hono<AppEnv>();

reportsRouter.get("/reports/dashboard", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const requestedShopId = c.req.query("shopId");
  const shopId = c.get("session").shopId;
  if (requestedShopId && requestedShopId !== shopId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);

  // ── KV cache (5 min TTL, busted on every sale or debt payment) ──────────────
  if (shopId) {
    const ck = CK.dashboard(shopId, date);
    const cached = await kvGet<object>(c.env.SESSIONS, ck);
    if (cached) return c.json(cached);
  }
  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay = `${date}T23:59:59.999Z`;

  // Aggregate sales in SQLite: the dashboard needs totals, not every sale row.
  // This keeps response size and Worker CPU flat as transaction history grows.
  const [daySalesSummary, lowStockRow, outOfStockRow, pendingDebts, unreadNotifications, itemsSold, cashCollectedRow] = await Promise.all([
    db.select({
      totalRevenue: sql<number>`COALESCE(SUM(${sales.totalAmount}), 0)`,
      totalCost: sql<number>`COALESCE(SUM(${sales.totalCost}), 0)`,
      totalProfit: sql<number>`COALESCE(SUM(${sales.totalProfit}), 0)`,
      salesCount: sql<number>`COUNT(*)`,
      cashSales: sql<number>`COALESCE(SUM(CASE WHEN ${sales.saleType} = 'cash' THEN ${sales.totalAmount} ELSE 0 END), 0)`,
      debtSales: sql<number>`COALESCE(SUM(CASE WHEN ${sales.saleType} = 'debt' THEN ${sales.totalAmount} ELSE 0 END), 0)`,
      bankSales: sql<number>`COALESCE(SUM(CASE WHEN ${sales.saleType} = 'cash' AND ${sales.paymentMethod} = 'bank' THEN ${sales.totalAmount} ELSE 0 END), 0)`,
    }).from(sales).where(
      and(
        eq(sales.shopId, shopId),
        eq(sales.isDeleted, false),
        gte(sales.createdAt, startOfDay),
        lte(sales.createdAt, endOfDay),
      ),
    ).get(),
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

  const totalRevenue = daySalesSummary?.totalRevenue ?? 0;
  const totalCost = daySalesSummary?.totalCost ?? 0;
  const totalProfit = daySalesSummary?.totalProfit ?? 0;
  const cashSales = daySalesSummary?.cashSales ?? 0;
  const debtSales = daySalesSummary?.debtSales ?? 0;
  const bankSales = daySalesSummary?.bankSales ?? 0;
  const cashOnlySales = cashSales - bankSales;

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
    salesCount: daySalesSummary?.salesCount ?? 0,
    marginPct: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    cashSales,
    cashOnlySales,
    bankSales,
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
  const requestedShopId = c.req.query("shopId");
  const shopId = c.get("session").shopId;
  if (requestedShopId && requestedShopId !== shopId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const from = c.req.query("from")!;
  const to = c.req.query("to")!;

  const fromTs = `${from}T00:00:00.000Z`;
  const toTs = `${to}T23:59:59.999Z`;

  // One grouped SQL query replaces transferring every historical sale into
  // the Worker. Daily rows are also the exact data needed for the chart.
  const [dailyRows, cashCollectedRow] = await Promise.all([
    db.select({
      date: sql<string>`substr(${sales.createdAt}, 1, 10)`,
      revenue: sql<number>`COALESCE(SUM(${sales.totalAmount}), 0)`,
      cost: sql<number>`COALESCE(SUM(${sales.totalCost}), 0)`,
      profit: sql<number>`COALESCE(SUM(${sales.totalProfit}), 0)`,
      salesCount: sql<number>`COUNT(*)`,
      cashSales: sql<number>`COALESCE(SUM(CASE WHEN ${sales.saleType} = 'cash' THEN ${sales.totalAmount} ELSE 0 END), 0)`,
      debtSales: sql<number>`COALESCE(SUM(CASE WHEN ${sales.saleType} = 'debt' THEN ${sales.totalAmount} ELSE 0 END), 0)`,
    }).from(sales).where(
      and(
        eq(sales.shopId, shopId),
        eq(sales.isDeleted, false),
        gte(sales.createdAt, fromTs),
        lte(sales.createdAt, toTs),
      ),
    ).groupBy(sql`substr(${sales.createdAt}, 1, 10)`).orderBy(sql`substr(${sales.createdAt}, 1, 10)`).all(),
    db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` }).from(debtPayments).where(
      sql`paid_at >= ${fromTs} AND paid_at <= ${toTs}${shopId ? sql` AND debt_id IN (SELECT id FROM debts WHERE shop_id = ${shopId})` : sql``}`,
    ).get(),
  ]);

  const totalRevenue = dailyRows.reduce((sum, row) => sum + row.revenue, 0);
  const totalCost = dailyRows.reduce((sum, row) => sum + row.cost, 0);
  const totalProfit = dailyRows.reduce((sum, row) => sum + row.profit, 0);
  const cashSales = dailyRows.reduce((sum, row) => sum + row.cashSales, 0);
  const debtSales = dailyRows.reduce((sum, row) => sum + row.debtSales, 0);
  const salesCount = dailyRows.reduce((sum, row) => sum + row.salesCount, 0);
  const cashCollected = cashCollectedRow?.total ?? 0;
  const dailyBreakdown = dailyRows.map(({ date, revenue, profit, salesCount }) => ({
    date, revenue, profit, salesCount,
  }));

  return c.json({
    from,
    to,
    shopId,
    totalRevenue,
    totalProfit,
    totalCost,
    salesCount,
    marginPct: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    cashSales,
    debtSales,
    cashCollected,
    dailyBreakdown,
  });
});

reportsRouter.get("/reports/monthly-sales", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const requestedShopId = c.req.query("shopId");
  const shopId = c.get("session").shopId;
  if (requestedShopId && requestedShopId !== shopId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const rawYear = c.req.query("year");
  const year = Number(rawYear);
  const currentYear = new Date().getFullYear();

  if (!shopId) return c.json({ error: "shopId is required" }, 400);
  if (!/^\d{4}$/.test(rawYear ?? "") || !Number.isInteger(year) || year < 2000 || year > currentYear) {
    return c.json({ error: `year must be between 2000 and ${currentYear}` }, 400);
  }

  const fromTs = `${year}-01-01T00:00:00.000Z`;
  const toTs = `${year}-12-31T23:59:59.999Z`;
  const groupedRows = await db
    .select({
      month: sql<number>`CAST(strftime('%m', ${sales.createdAt}) AS INTEGER)`,
      revenue: sql<number>`COALESCE(SUM(${sales.totalAmount}), 0)`,
      profit: sql<number>`COALESCE(SUM(${sales.totalProfit}), 0)`,
      salesCount: sql<number>`COUNT(*)`,
    })
    .from(sales)
    .where(
      and(
        eq(sales.shopId, shopId),
        eq(sales.isDeleted, false),
        gte(sales.createdAt, fromTs),
        lte(sales.createdAt, toTs),
      ),
    )
    .groupBy(sql`strftime('%m', ${sales.createdAt})`)
    .all();

  const groupedByMonth = new Map(groupedRows.map((row) => [row.month, row]));
  const monthlyBreakdown = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const row = groupedByMonth.get(month);
    return {
      month,
      revenue: row?.revenue ?? 0,
      profit: row?.profit ?? 0,
      salesCount: row?.salesCount ?? 0,
    };
  });

  return c.json({
    shopId,
    year,
    totalRevenue: monthlyBreakdown.reduce((total, month) => total + month.revenue, 0),
    totalProfit: monthlyBreakdown.reduce((total, month) => total + month.profit, 0),
    totalSalesCount: monthlyBreakdown.reduce((total, month) => total + month.salesCount, 0),
    monthlyBreakdown,
  });
});

reportsRouter.get("/reports/top-products", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const requestedShopId = c.req.query("shopId");
  const shopId = c.get("session").shopId;
  if (requestedShopId && requestedShopId !== shopId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const from = c.req.query("from");
  const to = c.req.query("to");
  const limit = parseInt(c.req.query("limit") ?? "10");

  const fromTs = from ? `${from}T00:00:00.000Z` : "2020-01-01T00:00:00.000Z";
  const toTs = to ? `${to}T23:59:59.999Z` : new Date().toISOString();
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 10));
  const productKey = sql`COALESCE(${saleItems.productId}, ${saleItems.productName})`;
  const displayName = sql<string>`COALESCE(${products.canonicalName}, ${saleItems.productName})`;

  // Aggregate at the database so report cost scales with products sold, not
  // every historical line item. The response fields remain unchanged.
  const topProducts = await db
    .select({
      productId: productKey,
      productName: displayName,
      totalQtySold: sql<number>`COALESCE(SUM(${saleItems.qty}), 0)`,
      totalRevenue: sql<number>`COALESCE(SUM(${saleItems.totalPrice}), 0)`,
      totalProfit: sql<number>`COALESCE(SUM(${saleItems.totalProfit}), 0)`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .leftJoin(products, eq(saleItems.productId, products.id))
    .where(and(
      eq(sales.shopId, shopId),
      eq(sales.isDeleted, false),
      gte(sales.createdAt, fromTs),
      lte(sales.createdAt, toTs),
    ))
    .groupBy(productKey, displayName)
    .orderBy(sql`SUM(${saleItems.totalPrice}) DESC`)
    .limit(safeLimit)
    .all();

  return c.json(topProducts);
});

reportsRouter.get("/reports/category-breakdown", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const requestedShopId = c.req.query("shopId");
  const shopId = c.get("session").shopId;
  if (requestedShopId && requestedShopId !== shopId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const from = c.req.query("from");
  const to = c.req.query("to");

  const fromTs = from ? `${from}T00:00:00.000Z` : "2020-01-01T00:00:00.000Z";
  const toTs = to ? `${to}T23:59:59.999Z` : new Date().toISOString();

  const productKey = sql`COALESCE(${saleItems.productId}, ${saleItems.productName})`;
  const displayName = sql<string>`COALESCE(${products.canonicalName}, ${saleItems.productName})`;
  const categoryName = sql<string>`COALESCE(${products.category}, 'Uncategorized')`;

  // Return one row per product/category rather than every historical sale line.
  const items = await db.select({
    productId: saleItems.productId,
    productName: displayName,
    category: categoryName,
    qty: sql<number>`COALESCE(SUM(${saleItems.qty}), 0)`,
    totalPrice: sql<number>`COALESCE(SUM(${saleItems.totalPrice}), 0)`,
    totalProfit: sql<number>`COALESCE(SUM(${saleItems.totalProfit}), 0)`,
  }).from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .leftJoin(products, eq(saleItems.productId, products.id))
    .where(and(
      eq(sales.shopId, shopId),
      eq(sales.isDeleted, false),
      gte(sales.createdAt, fromTs),
      lte(sales.createdAt, toTs),
    ))
    .groupBy(productKey, displayName, categoryName)
    .all();

  type ProdEntry = { productId: string; productName: string; qtySold: number; totalRevenue: number; totalProfit: number };
  type CatEntry = { category: string; totalRevenue: number; totalProfit: number; salesCount: number; products: Map<string, ProdEntry> };
  const map = new Map<string, CatEntry>();

  for (const item of items) {
    const category = item.category ?? "Uncategorized";
    const productName = item.productName ?? "Unknown";
    const key = item.productId ?? productName;

    let catEntry = map.get(category);
    if (!catEntry) {
      catEntry = { category, totalRevenue: 0, totalProfit: 0, salesCount: 0, products: new Map() };
      map.set(category, catEntry);
    }
    catEntry.totalRevenue += item.totalPrice;
    catEntry.totalProfit += item.totalProfit ?? 0;
    catEntry.salesCount += item.qty;

    let prodEntry = catEntry.products.get(key);
    if (!prodEntry) {
      prodEntry = { productId: item.productId ?? "", productName, qtySold: 0, totalRevenue: 0, totalProfit: 0 };
      catEntry.products.set(key, prodEntry);
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
  const requestedShopId = c.req.query("shopId");
  const shopId = c.get("session").shopId;
  if (requestedShopId && requestedShopId !== shopId) {
    return c.json({ error: "Forbidden" }, 403);
  }
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
  const requestedShopId = c.req.query("shopId");
  const shopId = c.get("session").shopId;
  if (requestedShopId && requestedShopId !== shopId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [unpaid, partial] = await Promise.all([
    db.select({
      balance: sql<number>`COALESCE(SUM(${debts.balance}), 0)`,
      totalAmount: sql<number>`COALESCE(SUM(${debts.totalAmount}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(debts).where(and(eq(debts.shopId, shopId), eq(debts.status, "unpaid"))).get(),
    db.select({
      balance: sql<number>`COALESCE(SUM(${debts.balance}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(debts).where(and(eq(debts.shopId, shopId), eq(debts.status, "partial"))).get(),
  ]);

  return c.json({
    totalOutstanding: (unpaid?.balance ?? 0) + (partial?.balance ?? 0),
    totalUnpaid: unpaid?.totalAmount ?? 0,
    totalPartial: partial?.balance ?? 0,
    unpaidCount: unpaid?.count ?? 0,
    partialCount: partial?.count ?? 0,
  });
});

// ── Product sales search ──────────────────────────────────────────────────────
// Search by product name across sale_items. Returns each matching variant as
// its own row plus a combined summary so the user can see "Roundup 500ml" and
// "Roundup 1L" individually AND their combined revenue/profit/qty total.
reportsRouter.get("/reports/product-search", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const requestedShopId = c.req.query("shopId");
  const shopId = c.get("session").shopId;
  if (requestedShopId && requestedShopId !== shopId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const from = c.req.query("from");
  const to = c.req.query("to");

  if (!q || q.length < 2) {
    return c.json({ query: q, variants: [], summary: null });
  }

  const fromTs = from ? `${from}T00:00:00.000Z` : "2020-01-01T00:00:00.000Z";
  const toTs   = to   ? `${to}T23:59:59.999Z`   : new Date().toISOString();

  const productKey = sql`COALESCE(${saleItems.productId}, ${saleItems.productName})`;
  const displayName = sql<string>`COALESCE(${products.canonicalName}, ${saleItems.productName})`;
  const categoryName = sql<string>`COALESCE(${products.category}, 'Uncategorized')`;
  const searchPattern = `%${q}%`;

  // Filter and aggregate in SQLite. The previous version loaded every sale
  // line in the date range into Worker memory before applying the product
  // search, making a single-product lookup increasingly expensive over time.
  const aggregated = await db.select({
    productId: saleItems.productId,
    productName: displayName,
    category: categoryName,
    totalQty: sql<number>`COALESCE(SUM(${saleItems.qty}), 0)`,
    totalRevenue: sql<number>`COALESCE(SUM(${saleItems.totalPrice}), 0)`,
    totalProfit: sql<number>`COALESCE(SUM(${saleItems.totalProfit}), 0)`,
    salesCount: sql<number>`COUNT(*)`,
  }).from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .leftJoin(products, eq(saleItems.productId, products.id))
    .where(and(
      eq(sales.shopId, shopId),
      eq(sales.isDeleted, false),
      gte(sales.createdAt, fromTs),
      lte(sales.createdAt, toTs),
      or(
        sql`lower(${products.canonicalName}) LIKE ${searchPattern}`,
        sql`lower(${saleItems.productName}) LIKE ${searchPattern}`,
      ),
    ))
    .groupBy(productKey, displayName, categoryName)
    .orderBy(sql`SUM(${saleItems.totalPrice}) DESC`)
    .all();

  const variants = aggregated.map((item) => ({
    productId: item.productId ?? item.productName,
    productName: item.productName,
    category: item.category,
    totalQty: item.totalQty,
    totalRevenue: item.totalRevenue,
    totalProfit: item.totalProfit,
    salesCount: item.salesCount,
  }));

  const summary = variants.length === 0 ? null : {
    totalQty: variants.reduce((sum, item) => sum + item.totalQty, 0),
    totalRevenue: variants.reduce((sum, item) => sum + item.totalRevenue, 0),
    totalProfit: variants.reduce((sum, item) => sum + item.totalProfit, 0),
    salesCount: variants.reduce((sum, item) => sum + item.salesCount, 0),
  };

  return c.json({ query: q, from: fromTs, to: toTs, variants, summary });
});

export default reportsRouter;
