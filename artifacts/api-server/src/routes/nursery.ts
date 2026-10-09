import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../middleware/auth";

const nurseryRouter = new Hono<AppEnv>();
const paymentMethods = new Set(["cash", "mpesa"]);

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z"));
}

nurseryRouter.get("/nursery/varieties", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const rows = await c.env.DB.prepare(
    "SELECT id, name, (default_price / 100.0) AS defaultPrice, is_active AS isActive, created_at AS createdAt FROM nursery_varieties WHERE shop_id = ? ORDER BY is_active DESC, name COLLATE NOCASE"
  ).bind(shopId).all();
  return c.json(rows.results ?? []);
});

nurseryRouter.post("/nursery/varieties", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const body = await c.req.json<{ name?: string; defaultPrice?: number }>();
  const name = body.name?.trim().replace(/\s+/g, " ");
  const price = Number(body.defaultPrice);
  if (!name || name.length > 80 || !Number.isFinite(price) || price < 0 || price > 1000000) {
    return c.json({ error: "Enter a variety name and a valid non-negative price." }, 400);
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await c.env.DB.prepare(
      "INSERT INTO nursery_varieties (id, shop_id, name, default_price, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)"
    ).bind(id, shopId, name, Math.round(price * 100), now, now).run();
  } catch {
    return c.json({ error: "A variety with that name may already exist in this shop." }, 409);
  }
  return c.json({ id, name, defaultPrice: Math.round(price * 100) / 100, isActive: 1, createdAt: now }, 201);
});

nurseryRouter.patch("/nursery/varieties/:id", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const id = c.req.param("id");
  const body = await c.req.json<{ name?: string; defaultPrice?: number; isActive?: boolean }>();
  if (body.name !== undefined) {
    const name = body.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > 80) return c.json({ error: "Variety name must be 1–80 characters." }, 400);
    try {
      await c.env.DB.prepare("UPDATE nursery_varieties SET name = ?, updated_at = ? WHERE id = ? AND shop_id = ?")
        .bind(name, new Date().toISOString(), id, shopId).run();
    } catch { return c.json({ error: "A variety with that name may already exist." }, 409); }
  }
  if (body.defaultPrice !== undefined) {
    const price = Number(body.defaultPrice);
    if (!Number.isFinite(price) || price < 0 || price > 1000000) return c.json({ error: "Enter a valid price." }, 400);
    await c.env.DB.prepare("UPDATE nursery_varieties SET default_price = ?, updated_at = ? WHERE id = ? AND shop_id = ?")
      .bind(Math.round(price * 100), new Date().toISOString(), id, shopId).run();
  }
  if (body.isActive !== undefined) {
    await c.env.DB.prepare("UPDATE nursery_varieties SET is_active = ?, updated_at = ? WHERE id = ? AND shop_id = ?")
      .bind(body.isActive ? 1 : 0, new Date().toISOString(), id, shopId).run();
  }
  const row = await c.env.DB.prepare(
    "SELECT id, name, (default_price / 100.0) AS defaultPrice, is_active AS isActive, created_at AS createdAt FROM nursery_varieties WHERE id = ? AND shop_id = ?"
  ).bind(id, shopId).first();
  if (!row) return c.json({ error: "Variety not found." }, 404);
  return c.json(row);
});

nurseryRouter.post("/nursery/entries", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const body = await c.req.json<{
    requestId?: string; businessDate?: string; varietyId?: string;
    quantity?: number; unitPrice?: number; paymentMethod?: string;
  }>();
  const businessDate = body.businessDate ?? "";
  const quantity = Number(body.quantity);
  const unitPrice = Number(body.unitPrice);
  const paymentMethod = body.paymentMethod ?? "";
  const requestId = body.requestId ?? "";
  if (!/^[\w-]{8,80}$/.test(requestId) || !validDate(businessDate) ||
      !body.varietyId || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10000000 ||
      !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000 ||
      !paymentMethods.has(paymentMethod)) {
    return c.json({ error: "Check the date, variety, quantity, price and payment method." }, 400);
  }
  const variety = await c.env.DB.prepare(
    "SELECT id FROM nursery_varieties WHERE id = ? AND shop_id = ? AND is_active = 1"
  ).bind(body.varietyId, shopId).first();
  if (!variety) return c.json({ error: "Choose an active seedling variety for this shop." }, 400);

  const unitPriceCents = Math.round(unitPrice * 100);
  const now = new Date().toISOString();
  // Batch is transactional. The request ID makes retries safe: a repeated client
  // submission cannot increment the aggregate twice, even if the first response was lost.
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO nursery_daily_sales
        (id, shop_id, business_date, variety_id, unit_price_cents, payment_method, quantity, total_amount_cents, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM nursery_entry_requests WHERE id = ? AND shop_id = ?)
       ON CONFLICT(shop_id, business_date, variety_id, unit_price_cents, payment_method)
       DO UPDATE SET quantity = nursery_daily_sales.quantity + excluded.quantity,
         total_amount_cents = nursery_daily_sales.total_amount_cents + excluded.total_amount_cents,
         updated_at = excluded.updated_at`
    ).bind(crypto.randomUUID(), shopId, businessDate, body.varietyId, unitPriceCents, paymentMethod,
      quantity, quantity * unitPriceCents, now, now, requestId, shopId),
    c.env.DB.prepare(
      "INSERT OR IGNORE INTO nursery_entry_requests (id, shop_id, created_at) VALUES (?, ?, ?)"
    ).bind(requestId, shopId, now),
  ]);
  return c.json({ ok: true, requestId });
});

nurseryRouter.get("/nursery/report", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";
  if (!validDate(from) || !validDate(to) || from > to) {
    return c.json({ error: "Choose a valid report date range." }, 400);
  }
  // Aggregate in SQLite: only a small result set is returned to the Worker.
  const rows = await c.env.DB.prepare(
    `SELECT s.business_date AS businessDate, s.variety_id AS varietyId, v.name AS varietyName,
      s.unit_price_cents AS unitPriceCents, s.payment_method AS paymentMethod,
      SUM(s.quantity) AS quantity, SUM(s.total_amount_cents) AS totalAmountCents
     FROM nursery_daily_sales s
     JOIN nursery_varieties v ON v.id = s.variety_id AND v.shop_id = s.shop_id
     WHERE s.shop_id = ? AND s.business_date >= ? AND s.business_date <= ?
     GROUP BY s.business_date, s.variety_id, v.name, s.unit_price_cents, s.payment_method
     ORDER BY s.business_date DESC, v.name COLLATE NOCASE, s.payment_method`
  ).bind(shopId, from, to).all();
  const summary = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(quantity), 0) AS totalSeedlings,
      COALESCE(SUM(total_amount_cents), 0) AS totalRevenueCents,
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount_cents ELSE 0 END), 0) AS cashCents,
      COALESCE(SUM(CASE WHEN payment_method = 'mpesa' THEN total_amount_cents ELSE 0 END), 0) AS mpesaCents
     FROM nursery_daily_sales WHERE shop_id = ? AND business_date >= ? AND business_date <= ?`
  ).bind(shopId, from, to).first();
  return c.json({ rows: rows.results ?? [], summary });
});

export default nurseryRouter;
