import { Hono } from "hono";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { sales, saleItems, products, debts, notifications } from "@workspace/db/schema";
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

  const totalRevenue = daySales.reduce((s, sale) => s + sale.totalAmount, 0);
  const totalCost = daySales.reduce((s, sale) => s + (sale.totalCost ?? 0), 0);
  const totalProfit = daySales.reduce((s, sale) => s + (sale.totalProfit ?? 0), 0);
  const cashSales = daySales.filter((s) => s.saleType === "cash").reduce((sum, s) => sum + s.totalAmount, 0);
  const debtSales = daySales.filter((s) => s.saleType === "debt").reduce((sum, s) => sum + s.totalAmount, 0);

  const allProducts = await db
    .select()
    .from(products)
    .where(shopId ? eq(products.shopId, shopId) : undefined)
    .all();
  const lowStockCount = allProducts.filter((p) => p.isActive && p.stockQty <= p.alertQty && p.stockQty > 0).length;
  const outOfStockCount = allProducts.filter((p) => p.isActive && p.stockQty === 0).length;

  const pendingDebts = await db
    .select()
    .from(debts)
    .where(
      and(
        shopId ? eq(debts.shopId, shopId) : undefined,
        sql`status != 'paid'`,
      ),
    )
    .all();
  const pendingDebtsTotal = pendingDebts.reduce((s, d) => s + d.balance, 0);

  const unreadNotifications = await db
    .select()
    .from(notifications)
    .where(
      and(
        shopId ? eq(notifications.shopId, shopId) : undefined,
        eq(notifications.isRead, false),
      ),
    )
    .all();

  const itemsSold = await db
    .select()
    .from(saleItems)
    .where(
      sql`sale_id IN (SELECT id FROM sales WHERE is_deleted = 0 AND created_at >= ${startOfDay} AND created_at <= ${endOfDay}${shopId ? sql` AND shop_id = ${shopId}` : sql``})`,
    )
    .all();

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

  const rangeSales = await db
    .select()
    .from(sales)
    .where(
      and(
        shopId ? eq(sales.shopId, shopId) : undefined,
        eq(sales.isDeleted, false),
        gte(sales.createdAt, fromTs),
        lte(sales.createdAt, toTs),
      ),
    )
    .all();

  const totalRevenue = rangeSales.reduce((s, sale) => s + sale.totalAmount, 0);
  const totalCost = rangeSales.reduce((s, sale) => s + (sale.totalCost ?? 0), 0);
  const totalProfit = rangeSales.reduce((s, sale) => s + (sale.totalProfit ?? 0), 0);

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

  const items = await db
    .select()
    .from(saleItems)
    .where(
      sql`sale_id IN (SELECT id FROM sales WHERE is_deleted = 0 AND created_at >= ${fromTs} AND created_at <= ${toTs}${shopId ? sql` AND shop_id = ${shopId}` : sql``})`,
    )
    .all();

  const allProducts = await db.select().from(products).where(shopId ? eq(products.shopId, shopId) : undefined).all();
  const productCategoryMap = new Map(allProducts.map((p) => [p.id, p.category ?? "Uncategorized"]));

  const map = new Map<string, { category: string; totalRevenue: number; totalProfit: number; salesCount: number }>();
  for (const item of items) {
    const category = (item.productId ? productCategoryMap.get(item.productId) : null) ?? "Uncategorized";
    const existing = map.get(category);
    if (existing) {
      existing.totalRevenue += item.totalPrice;
      existing.totalProfit += item.totalProfit ?? 0;
      existing.salesCount++;
    } else {
      map.set(category, { category, totalRevenue: item.totalPrice, totalProfit: item.totalProfit ?? 0, salesCount: 1 });
    }
  }

  return c.json(Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue));
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

export default reportsRouter;
