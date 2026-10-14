import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { notifications, debts, products } from "@workspace/db/schema";
import { broadcastPush, getVapidConfig } from "../lib/web-push";

const notificationsRouter = new Hono<AppEnv>();
const DEFAULT_NOTIFICATION_PAGE_SIZE = 50;
const MAX_NOTIFICATION_PAGE_SIZE = 101;

notificationsRouter.get("/notifications/unread-count", requireAuth, async (c) => {
  const sessionShopId = c.get("session").shopId;
  const requestedShopId = c.req.query("shopId");
  if (requestedShopId && requestedShopId !== sessionShopId) {
    return c.json({ error: "Shop access denied." }, 403);
  }

  const result = await c.env.DB.prepare(
    "SELECT unread_count AS count FROM notification_unread_counts WHERE shop_id = ?",
  ).bind(sessionShopId).first<{ count: number }>();

  return c.json({ count: Number(result?.count ?? 0) });
});

notificationsRouter.get("/notifications", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const sessionShopId = c.get("session").shopId;
  const requestedShopId = c.req.query("shopId");
  if (requestedShopId && requestedShopId !== sessionShopId) {
    return c.json({ error: "Shop access denied." }, 403);
  }
  const unreadOnly = c.req.query("unreadOnly") === "true";
  const limitParam = c.req.query("limit");
  const offsetParam = c.req.query("offset");
  const requestedLimit = limitParam === undefined
    ? DEFAULT_NOTIFICATION_PAGE_SIZE
    : Number.parseInt(limitParam, 10);
  const offset = offsetParam === undefined ? 0 : Number.parseInt(offsetParam, 10);

  if (
    !Number.isInteger(requestedLimit) || requestedLimit < 1 ||
    !Number.isInteger(offset) || offset < 0
  ) {
    return c.json({ error: "Use a positive limit and a non-negative offset." }, 400);
  }

  const query = db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.shopId, sessionShopId),
        unreadOnly ? eq(notifications.isRead, false) : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt));
  const rows = await query
    .limit(Math.min(requestedLimit, MAX_NOTIFICATION_PAGE_SIZE))
    .offset(offset)
    .all();

  return c.json(rows);
});

notificationsRouter.post("/notifications/generate", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const shopId = session.shopId;
  const now = new Date().toISOString();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const day30Str = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const day90Str = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // ── Load all data in ONE parallel batch — eliminates N+1 per-product queries ──
  const [allDebts, allProducts, existingNotifs] = await Promise.all([
    db.select().from(debts).where(eq(debts.shopId, shopId)).all(),
    db.select().from(products).where(and(eq(products.shopId, shopId), eq(products.isActive, true))).all(),
    db.select({ productId: notifications.productId, debtId: notifications.debtId, type: notifications.type })
      .from(notifications)
      .where(and(eq(notifications.shopId, shopId), eq(notifications.isRead, false)))
      .all(),
  ]);

  // Build O(1) lookup sets — no more per-item D1 reads
  const existingDebtKeys = new Set(
    existingNotifs.filter(n => n.debtId).map(n => `${n.type}:${n.debtId}`),
  );
  const existingProductKeys = new Set(
    existingNotifs.filter(n => n.productId).map(n => `${n.type}:${n.productId}`),
  );

  const toInsert: Array<typeof notifications.$inferInsert> = [];

  // ── 1. Debt reminders — unpaid/partial debts older than 30 days ──────────
  for (const debt of allDebts) {
    if (debt.status === "paid") continue;
    if (debt.createdAt >= thirtyDaysAgo) continue;
    if (existingDebtKeys.has(`debt_reminder:${debt.id}`)) continue;

    const daysPast = Math.floor((Date.now() - new Date(debt.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    const balanceStr = debt.balance.toLocaleString("en-KE", { maximumFractionDigits: 0 });
    const phoneNote = debt.customerPhone ? ` · ${debt.customerPhone}` : "";
    toInsert.push({
      id: crypto.randomUUID(), shopId, type: "debt_reminder",
      title: `Overdue — ${debt.customerName}`,
      message: `KES ${balanceStr} outstanding for ${daysPast} day${daysPast !== 1 ? "s" : ""}${phoneNote}`,
      productId: null, debtId: debt.id, isRead: false, createdAt: now,
    });
  }

  // ── 2. Expiry alerts — 3 tiers over a 90-day window ──────────────────────
  //   expired        → past today          (red)
  //   expiry_soon    → 1–30 days           (amber — urgent)
  //   expiry_warning → 31–90 days          (yellow — plan ahead)
  for (const product of allProducts) {
    if (!product.expiryDate) continue;
    const expiry = product.expiryDate;

    let alertType: "expired" | "expiry_soon" | "expiry_warning";
    if (expiry < todayStr)       alertType = "expired";
    else if (expiry <= day30Str) alertType = "expiry_soon";
    else if (expiry <= day90Str) alertType = "expiry_warning";
    else continue; // > 90 days away — no alert yet

    if (existingProductKeys.has(`${alertType}:${product.id}`)) continue;

    const stockNote = product.stockQty > 0
      ? ` · ${product.stockQty} ${product.unit || "units"} in stock` : "";

    if (alertType === "expired") {
      toInsert.push({
        id: crypto.randomUUID(), shopId, type: "expired",
        title: `Expired — ${product.canonicalName}`,
        message: `Expired on ${expiry}${stockNote}. Remove from sale immediately.`,
        productId: product.id, debtId: null, isRead: false, createdAt: now,
      });
    } else {
      const daysLeft = Math.ceil((new Date(expiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const urgencyLabel = alertType === "expiry_soon" ? "Expiring Soon" : "Expiring in 90 Days";
      toInsert.push({
        id: crypto.randomUUID(), shopId, type: alertType,
        title: `${urgencyLabel} — ${product.canonicalName}`,
        message: `Expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} (${expiry})${stockNote}.`,
        productId: product.id, debtId: null, isRead: false, createdAt: now,
      });
    }
  }

  // ── 3. Low-stock alerts ───────────────────────────────────────────────────
  for (const product of allProducts) {
    if (product.stockQty > product.alertQty) continue;
    if (existingProductKeys.has(`low_stock:${product.id}`)) continue;

    const stockLabel = product.stockQty <= 0
      ? "Out of stock"
      : `Only ${product.stockQty} ${product.unit || "units"} remaining`;

    toInsert.push({
      id: crypto.randomUUID(), shopId, type: "low_stock",
      title: `Low Stock — ${product.canonicalName}`,
      message: `${stockLabel} (reorder threshold: ${product.alertQty} ${product.unit || "units"}).`,
      productId: product.id, debtId: null, isRead: false, createdAt: now,
    });
  }

  // ── Batch-insert all new notifications ───────────────────────────────────
  for (const n of toInsert) {
    await db.insert(notifications).values(n);
  }
  const generated = toInsert.length;

  // ── Push notification broadcast (fire-and-forget) ─────────────────────────
  if (generated > 0) {
    const vapid = getVapidConfig(c.env);
    if (vapid) {
      const label = generated === 1 ? "1 new alert" : `${generated} new alerts`;
      broadcastPush(
        c.env.DB, shopId,
        { title: `GreenLink OS — ${session.shopName}`, body: `${label} need your attention.`, url: "/alerts", type: "alert" },
        vapid,
      ).catch(() => {});
    }
  }

  return c.json({ generated });
});

notificationsRouter.patch(
  "/notifications/:notificationId/read",
  requireAuth,
  async (c) => {
    const db = createDb(c.env.DB);
    const sessionShopId = c.get("session").shopId;
    const notificationId = c.req.param("notificationId");
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, notificationId), eq(notifications.shopId, sessionShopId)));
    const notification = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.shopId, sessionShopId)))
      .get();
    if (!notification) return c.json({ error: "Not found" }, 404);
    return c.json(notification);
  },
);

notificationsRouter.patch(
  "/notifications/read-all",
  requireAuth,
  async (c) => {
    const db = createDb(c.env.DB);
    const sessionShopId = c.get("session").shopId;
    const requestedShopId = c.req.query("shopId");
    if (requestedShopId && requestedShopId !== sessionShopId) {
      return c.json({ error: "Shop access denied." }, 403);
    }
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.shopId, sessionShopId), eq(notifications.isRead, false)));
    return c.json({ success: true });
  },
);

export default notificationsRouter;
