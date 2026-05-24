import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { notifications, debts, products } from "@workspace/db/schema";
import { broadcastPush, getVapidConfig } from "../lib/web-push";

const notificationsRouter = new Hono<AppEnv>();

notificationsRouter.get("/notifications", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  const unreadOnly = c.req.query("unreadOnly") === "true";

  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        shopId ? eq(notifications.shopId, shopId) : undefined,
        unreadOnly ? eq(notifications.isRead, false) : undefined,
      ),
    )
    .all();

  return c.json(rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

notificationsRouter.post("/notifications/generate", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const shopId = session.shopId;
  const now = new Date().toISOString();
  let generated = 0;

  // ── 1. Debt reminders — unpaid/partial debts older than 30 days ──
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const allDebts = await db
    .select()
    .from(debts)
    .where(eq(debts.shopId, shopId))
    .all();

  for (const debt of allDebts) {
    if (debt.status === "paid") continue;
    if (debt.createdAt >= thirtyDaysAgo) continue;

    const existing = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.shopId, shopId),
          eq(notifications.debtId, debt.id),
          eq(notifications.type, "debt_reminder"),
          eq(notifications.isRead, false),
        ),
      )
      .get();

    if (!existing) {
      const daysPast = Math.floor(
        (Date.now() - new Date(debt.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      const balanceStr = debt.balance.toLocaleString("en-KE", { maximumFractionDigits: 0 });
      const phoneNote = debt.customerPhone ? ` · ${debt.customerPhone}` : "";
      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        shopId,
        type: "debt_reminder",
        title: `Overdue — ${debt.customerName}`,
        message: `KES ${balanceStr} outstanding for ${daysPast} day${daysPast !== 1 ? "s" : ""}${phoneNote}`,
        productId: null,
        debtId: debt.id,
        isRead: false,
        createdAt: now,
      });
      generated++;
    }
  }

  // ── 2. Expiry alerts — products with expiry_date set ──
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const soonDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const soonStr = soonDate.toISOString().slice(0, 10);

  const allProducts = await db
    .select()
    .from(products)
    .where(and(eq(products.shopId, shopId), eq(products.isActive, true)))
    .all();

  for (const product of allProducts) {
    if (!product.expiryDate) continue;
    const expiry = product.expiryDate;
    const isExpired = expiry < todayStr;
    const isExpiringSoon = !isExpired && expiry <= soonStr;

    if (!isExpired && !isExpiringSoon) continue;

    const alertType = isExpired ? "expired" : "expiry_soon";

    const existing = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.shopId, shopId),
          eq(notifications.productId, product.id),
          eq(notifications.type, alertType),
          eq(notifications.isRead, false),
        ),
      )
      .get();

    if (!existing) {
      const stockNote =
        product.stockQty > 0
          ? ` · ${product.stockQty} ${product.unit || "units"} in stock`
          : "";
      if (isExpired) {
        await db.insert(notifications).values({
          id: crypto.randomUUID(),
          shopId,
          type: "expired",
          title: `Expired — ${product.canonicalName}`,
          message: `Expired on ${expiry}${stockNote}. Remove from sale immediately.`,
          productId: product.id,
          debtId: null,
          isRead: false,
          createdAt: now,
        });
      } else {
        const daysLeft = Math.ceil(
          (new Date(expiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        await db.insert(notifications).values({
          id: crypto.randomUUID(),
          shopId,
          type: "expiry_soon",
          title: `Expiring Soon — ${product.canonicalName}`,
          message: `Expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} (${expiry})${stockNote}.`,
          productId: product.id,
          debtId: null,
          isRead: false,
          createdAt: now,
        });
      }
      generated++;
    }
  }

  // ── Push notification broadcast ──────────────────────────────────────────
  if (generated > 0) {
    const vapid = getVapidConfig(c.env);
    if (vapid) {
      const label = generated === 1 ? "1 new alert" : `${generated} new alerts`;
      broadcastPush(
        c.env.DB,
        shopId,
        { title: `GreenLink OS — ${session.shopName}`, body: `${label} need your attention.`, url: "/alerts", type: "alert" },
        vapid
      ).catch(() => {}); // fire-and-forget — don't delay the HTTP response
    }
  }

  return c.json({ generated });
});

notificationsRouter.patch(
  "/notifications/:notificationId/read",
  requireAuth,
  async (c) => {
    const db = createDb(c.env.DB);
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, c.req.param("notificationId")));
    const notification = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, c.req.param("notificationId")))
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
    const shopId = c.req.query("shopId");
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(shopId ? eq(notifications.shopId, shopId) : undefined);
    return c.json({ success: true });
  },
);

export default notificationsRouter;
