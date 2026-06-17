import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { quotations, shops } from "@workspace/db/schema";

const quotationsRouter = new Hono<AppEnv>();

// ── List quotations ────────────────────────────────────────────────────────────
quotationsRouter.get("/quotations", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  const status = c.req.query("status");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 500);
  const offset = parseInt(c.req.query("offset") ?? "0");

  if (!shopId) return c.json({ error: "shopId required" }, 400);

  const conditions = [eq(quotations.shopId, shopId)];
  if (status && status !== "all") {
    conditions.push(eq(quotations.status, status as any));
  }

  const rows = await db
    .select()
    .from(quotations)
    .where(and(...conditions))
    .orderBy(desc(quotations.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  return c.json(rows.map((q) => ({
    ...q,
    items: (() => { try { return JSON.parse(q.itemsJson); } catch { return []; } })(),
  })));
});

// ── Get single quotation ───────────────────────────────────────────────────────
quotationsRouter.get("/quotations/:id", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const q = await db
    .select()
    .from(quotations)
    .where(eq(quotations.id, c.req.param("id")))
    .get();
  if (!q) return c.json({ error: "Not found" }, 404);
  return c.json({
    ...q,
    items: (() => { try { return JSON.parse(q.itemsJson); } catch { return []; } })(),
  });
});

// ── Create quotation ───────────────────────────────────────────────────────────
quotationsRouter.post("/quotations", requireAuth, async (c) => {
  const body = await c.req.json<{
    shopId: string;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    notes?: string;
    validUntil?: string;
    discountAmount?: number;
    items: Array<{
      productId?: string;
      productName: string;
      unit?: string;
      qty: number;
      unitPrice: number;
      total: number;
    }>;
    createdBy?: string;
  }>();

  const db = createDb(c.env.DB);

  // Auto-generate quote number: Q-{YYYY}-{seq}
  const year = new Date().getFullYear();
  const { results: countRes } = await c.env.DB.prepare(
    "SELECT COUNT(*) as n FROM quotations WHERE shop_id = ?"
  ).bind(body.shopId).all();
  const seq = (Number((countRes as any)[0]?.n ?? 0) + 1);
  const quoteNumber = `Q-${year}-${seq.toString().padStart(4, "0")}`;

  const items = body.items ?? [];
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const discountAmount = body.discountAmount ?? 0;
  const total = Math.max(0, subtotal - discountAmount);

  const id = crypto.randomUUID();
  await db.insert(quotations).values({
    id,
    shopId: body.shopId,
    quoteNumber,
    customerName: body.customerName,
    customerPhone: body.customerPhone ?? "",
    customerEmail: body.customerEmail ?? null,
    status: "draft",
    notes: body.notes ?? null,
    validUntil: body.validUntil ?? null,
    subtotal,
    discountAmount,
    total,
    itemsJson: JSON.stringify(items),
    createdBy: body.createdBy ?? null,
    createdAt: new Date().toISOString(),
  });

  const q = await db.select().from(quotations).where(eq(quotations.id, id)).get();
  return c.json({
    ...q!,
    items,
  }, 201);
});

// ── Update quotation ───────────────────────────────────────────────────────────
quotationsRouter.patch("/quotations/:id", requireAuth, async (c) => {
  const body = await c.req.json<{
    status?: "draft" | "sent" | "accepted" | "rejected" | "expired";
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    notes?: string;
    validUntil?: string;
    discountAmount?: number;
    items?: Array<{
      productId?: string;
      productName: string;
      unit?: string;
      qty: number;
      unitPrice: number;
      total: number;
    }>;
  }>();

  const db = createDb(c.env.DB);
  const existing = await db.select().from(quotations).where(eq(quotations.id, c.req.param("id"))).get();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const patch: Partial<typeof quotations.$inferInsert> = {};
  if (body.status) patch.status = body.status;
  if (body.customerName) patch.customerName = body.customerName;
  if (body.customerPhone !== undefined) patch.customerPhone = body.customerPhone;
  if (body.customerEmail !== undefined) patch.customerEmail = body.customerEmail;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.validUntil !== undefined) patch.validUntil = body.validUntil;

  if (body.items !== undefined) {
    const items = body.items;
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const discountAmount = body.discountAmount ?? existing.discountAmount;
    patch.itemsJson = JSON.stringify(items);
    patch.subtotal = subtotal;
    patch.discountAmount = discountAmount;
    patch.total = Math.max(0, subtotal - discountAmount);
  } else if (body.discountAmount !== undefined) {
    patch.discountAmount = body.discountAmount;
    patch.total = Math.max(0, existing.subtotal - body.discountAmount);
  }

  await db.update(quotations).set(patch).where(eq(quotations.id, c.req.param("id")));
  const q = await db.select().from(quotations).where(eq(quotations.id, c.req.param("id"))).get();
  return c.json({
    ...q!,
    items: (() => { try { return JSON.parse(q!.itemsJson); } catch { return []; } })(),
  });
});

// ── Delete quotation ───────────────────────────────────────────────────────────
quotationsRouter.delete("/quotations/:id", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  await db.delete(quotations).where(eq(quotations.id, c.req.param("id")));
  return c.body(null, 204);
});

// ── Customers autocomplete (from debts + quotations) ───────────────────────────
// Returns unique customer names+phones for autocomplete in the quotation builder.
// Already exposed from debts router as /customers — kept here as a fallback.
quotationsRouter.get("/quotation-customers", requireAuth, async (c) => {
  const shopId = c.req.query("shopId");
  if (!shopId) return c.json([]);

  const { results } = await c.env.DB.prepare(`
    SELECT DISTINCT customer_name, customer_phone
    FROM (
      SELECT customer_name, customer_phone FROM debts WHERE shop_id = ?
      UNION
      SELECT customer_name, customer_phone FROM quotations WHERE shop_id = ? AND customer_name != ''
    )
    ORDER BY customer_name ASC
    LIMIT 200
  `).bind(shopId, shopId).all();

  return c.json(results ?? []);
});

export default quotationsRouter;
