import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../middleware/auth";
import { broadcastPush, getVapidConfig } from "../lib/web-push";

const pushRouter = new Hono<AppEnv>();

// GET /api/push/vapid-public-key — frontend needs this to subscribe
pushRouter.get("/push/vapid-public-key", requireAuth, async (c) => {
  const key = c.env.VAPID_PUBLIC_KEY ?? null;
  return c.json({ key });
});

// POST /api/push/subscribe — save or refresh a push subscription
pushRouter.post("/push/subscribe", requireAuth, async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }>();

  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return c.json({ error: "Invalid subscription object" }, 400);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO push_subscriptions (id, shop_id, endpoint, keys_p256dh, keys_auth, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      shop_id    = excluded.shop_id,
      keys_p256dh = excluded.keys_p256dh,
      keys_auth  = excluded.keys_auth
  `)
    .bind(crypto.randomUUID(), session.shopId, body.endpoint, body.keys.p256dh, body.keys.auth, now)
    .run();

  return c.json({ success: true });
});

// DELETE /api/push/subscribe — unsubscribe this device
pushRouter.delete("/push/subscribe", requireAuth, async (c) => {
  const body = await c.req.json<{ endpoint: string }>().catch(() => ({ endpoint: "" }));
  if (body?.endpoint) {
    await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
      .bind(body.endpoint)
      .run();
  }
  return c.json({ success: true });
});

// POST /api/push/test — send a test notification to every device for this shop (owner only)
pushRouter.post("/push/test", requireAuth, async (c) => {
  const session = c.get("session");
  if (session.role !== "owner") return c.json({ error: "Owner only" }, 403);

  const vapid = getVapidConfig(c.env);
  if (!vapid) return c.json({ error: "Push not configured on this server" }, 503);

  await broadcastPush(
    c.env.DB,
    session.shopId,
    {
      title: "GreenLink OS ✅",
      body: "Push notifications are working! You'll get stock & debt alerts here.",
      url: "/alerts",
      type: "test",
    },
    vapid
  );

  return c.json({ success: true });
});

export default pushRouter;
