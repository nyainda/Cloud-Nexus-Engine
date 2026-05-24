import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../middleware/auth";

const quotationsRouter = new Hono<AppEnv>();

quotationsRouter.get("/quotations", requireAuth, async (c) => {
  const db = c.env.DB;
  const shopId = c.req.query("shopId");
  const type = c.req.query("type");
  const status = c.req.query("status");
  if (!shopId) return c.json({ error: "shopId required" }, 400);

  let sql = "SELECT * FROM quotations WHERE shop_id = ?";
  const params: any[] = [shopId];
  if (type) { sql += " AND type = ?"; params.push(type); }
  if (status) { sql += " AND status = ?"; params.push(status); }
  sql += " ORDER BY created_at DESC LIMIT 200";

  const { results } = await db.prepare(sql).bind(...params).all();
  return c.json(results);
});

quotationsRouter.get("/quotations/:id", requireAuth, async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const q = await db.prepare("SELECT * FROM quotations WHERE id = ?").bind(id).first();
  if (!q) return c.json({ error: "Not found" }, 404);
  const { results: items } = await db.prepare(
    "SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY rowid"
  ).bind(id).all();
  return c.json({ ...q, items });
});

quotationsRouter.post("/quotations", requireAuth, async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{
    shopId: string;
    type: "quotation" | "invoice";
    customerName: string;
    customerPhone?: string;
    customerAddress?: string;
    validUntil?: string;
    notes?: string;
    discount?: number;
    createdBy?: string;
    items: Array<{
      productId?: string;
      productName: string;
      unit?: string;
      unitPrice: number;
      qty: number;
    }>;
  }>();

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const { results: existing } = await db.prepare(
    "SELECT COUNT(*) as n FROM quotations WHERE shop_id = ? AND type = ?"
  ).bind(body.shopId, body.type ?? "quotation").all();
  const count = Number((existing[0] as any)?.n ?? 0) + 1;
  const prefix = body.type === "invoice" ? "INV" : "QT";
  const quoteNumber = `${prefix}-${String(count).padStart(4, "0")}`;

  const subtotal = body.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const discount = body.discount ?? 0;
  const total = Math.max(0, subtotal - discount);

  await db.prepare(
    `INSERT INTO quotations (id, shop_id, quote_number, type, customer_name, customer_phone, customer_address, status, valid_until, notes, subtotal, discount, total, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, body.shopId, quoteNumber, body.type ?? "quotation",
    body.customerName, body.customerPhone ?? "", body.customerAddress ?? "",
    body.validUntil ?? null, body.notes ?? null,
    subtotal, discount, total, body.createdBy ?? "", now, now
  ).run();

  for (const item of body.items) {
    await db.prepare(
      `INSERT INTO quotation_items (id, quotation_id, product_id, product_name, unit, unit_price, qty, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), id, item.productId ?? null, item.productName,
      item.unit ?? "unit", item.unitPrice, item.qty, item.qty * item.unitPrice
    ).run();
  }

  const created = await db.prepare("SELECT * FROM quotations WHERE id = ?").bind(id).first();
  const { results: items } = await db.prepare("SELECT * FROM quotation_items WHERE quotation_id = ?").bind(id).all();
  return c.json({ ...created, items }, 201);
});

quotationsRouter.patch("/quotations/:id", requireAuth, async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const body = await c.req.json<{
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    status?: string;
    validUntil?: string;
    notes?: string;
    discount?: number;
    items?: Array<{
      productId?: string;
      productName: string;
      unit?: string;
      unitPrice: number;
      qty: number;
    }>;
  }>();

  const now = new Date().toISOString();
  const existing: any = await db.prepare("SELECT * FROM quotations WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const customerName = body.customerName ?? existing.customer_name;
  const customerPhone = body.customerPhone ?? existing.customer_phone;
  const customerAddress = body.customerAddress ?? existing.customer_address;
  const status = body.status ?? existing.status;
  const validUntil = body.validUntil !== undefined ? body.validUntil : existing.valid_until;
  const notes = body.notes !== undefined ? body.notes : existing.notes;
  const discount = body.discount !== undefined ? body.discount : existing.discount;

  let subtotal = existing.subtotal;
  let total = existing.total;

  if (body.items) {
    await db.prepare("DELETE FROM quotation_items WHERE quotation_id = ?").bind(id).run();
    subtotal = body.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    total = Math.max(0, subtotal - discount);
    for (const item of body.items) {
      await db.prepare(
        `INSERT INTO quotation_items (id, quotation_id, product_id, product_name, unit, unit_price, qty, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(), id, item.productId ?? null, item.productName,
        item.unit ?? "unit", item.unitPrice, item.qty, item.qty * item.unitPrice
      ).run();
    }
  } else {
    total = Math.max(0, subtotal - discount);
  }

  await db.prepare(
    `UPDATE quotations SET customer_name=?, customer_phone=?, customer_address=?, status=?, valid_until=?, notes=?, subtotal=?, discount=?, total=?, updated_at=? WHERE id=?`
  ).bind(customerName, customerPhone, customerAddress, status, validUntil, notes, subtotal, discount, total, now, id).run();

  const updated = await db.prepare("SELECT * FROM quotations WHERE id = ?").bind(id).first();
  const { results: items } = await db.prepare("SELECT * FROM quotation_items WHERE quotation_id = ?").bind(id).all();
  return c.json({ ...updated, items });
});

quotationsRouter.delete("/quotations/:id", requireAuth, async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  await db.prepare("DELETE FROM quotations WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

export default quotationsRouter;
