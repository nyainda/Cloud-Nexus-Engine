import { Hono } from "hono";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { sales, saleItems, products, debts, inventoryMovements, notifications, saleReturns, auditLog } from "@workspace/db/schema";
import { kvDel, CK } from "../lib/cache";

const salesRouter = new Hono<AppEnv>();

salesRouter.get("/sales", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  const limit = parseInt(c.req.query("limit") ?? "50");
  const offset = parseInt(c.req.query("offset") ?? "0");

  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay = `${date}T23:59:59.999Z`;

  const rows = await db
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
    .limit(limit)
    .offset(offset)
    .all();

  return c.json(rows);
});

salesRouter.post("/sales", requireAuth, async (c) => {
  const body = await c.req.json<{
    shopId: string;
    saleType: "cash" | "debt";
    servedBy?: string;
    discount?: number;
    discountOverrideBy?: string;
    items: Array<{
      productId: string;
      qty: number;
      unitPrice: number;
      discount?: number;
    }>;
    debtCustomerName?: string;
    debtCustomerPhone?: string;
  }>();

  const db = createDb(c.env.DB);
  const now = new Date().toISOString();
  const saleId = crypto.randomUUID();

  let totalAmount = 0;
  let totalCost = 0;
  let totalProfit = 0;
  const lineItems: Array<{
    id: string;
    saleId: string;
    productId: string | null;
    productName: string;
    qty: number;
    unitPrice: number;
    unitCost: number | null;
    unitProfit: number | null;
    totalPrice: number;
    totalProfit: number | null;
  }> = [];

  for (const item of body.items) {
    const product = await db
      .select()
      .from(products)
      .where(eq(products.id, item.productId))
      .get();

    const lineTotal = item.unitPrice * item.qty;
    const unitCost = product?.purchasePrice ?? null;
    const unitProfit = unitCost !== null ? item.unitPrice - unitCost : null;
    const lineProfit = unitProfit !== null ? unitProfit * item.qty : null;

    totalAmount += lineTotal;
    if (unitCost !== null) totalCost += unitCost * item.qty;
    if (lineProfit !== null) totalProfit += lineProfit;

    lineItems.push({
      id: crypto.randomUUID(),
      saleId,
      productId: item.productId,
      productName: product?.canonicalName ?? item.productId,
      qty: item.qty,
      unitPrice: item.unitPrice,
      unitCost,
      unitProfit,
      totalPrice: lineTotal,
      totalProfit: lineProfit,
    });
  }

  const discount = body.discount ?? 0;
  totalAmount = Math.max(0, totalAmount - discount);

  await db.insert(sales).values({
    id: saleId,
    shopId: body.shopId,
    totalAmount,
    totalCost: totalCost > 0 ? totalCost : null,
    totalProfit: totalProfit > 0 ? totalProfit : null,
    discount,
    saleType: body.saleType,
    servedBy: body.servedBy ?? null,
    syncStatus: "synced",
    isDeleted: false,
    createdAt: now,
  });

  for (const item of lineItems) {
    await db.insert(saleItems).values(item);
  }

  for (const item of body.items) {
    const product = await db
      .select()
      .from(products)
      .where(eq(products.id, item.productId))
      .get();
    if (product) {
      const beforeQty = product.stockQty;
      const afterQty = Math.max(0, beforeQty - item.qty);
      await db
        .update(products)
        .set({
          stockQty: afterQty,
          lastSoldAt: now,
          updatedAt: now,
        })
        .where(eq(products.id, item.productId));

      await db.insert(inventoryMovements).values({
        id: crypto.randomUUID(),
        productId: item.productId,
        productName: product.canonicalName,
        movementType: "sale",
        qtyChange: -item.qty,
        beforeQty,
        afterQty,
        source: "sale",
        referenceId: saleId,
        createdBy: body.servedBy ?? null,
        createdAt: now,
      });

      if (afterQty <= product.alertQty) {
        await db.insert(notifications).values({
          id: crypto.randomUUID(),
          shopId: body.shopId,
          type: "low_stock",
          title: "Low Stock Alert",
          message: `${product.canonicalName} is running low (${afterQty} remaining)`,
          productId: product.id,
          debtId: null,
          isRead: false,
          createdAt: now,
        });
      }
    }
  }

  if (body.saleType === "debt" && body.debtCustomerName) {
    const debtId = crypto.randomUUID();
    await db.insert(debts).values({
      id: debtId,
      shopId: body.shopId,
      saleId,
      customerName: body.debtCustomerName,
      customerPhone: body.debtCustomerPhone ?? "",
      totalAmount,
      amountPaid: 0,
      balance: totalAmount,
      status: "unpaid",
      notes: null,
      paidAt: null,
      createdAt: now,
    });
  }

  // Bust products + today's dashboard cache so next read is fresh from D1
  const today = new Date().toISOString().slice(0, 10);
  await kvDel(
    c.env.SESSIONS,
    CK.products(body.shopId),
    CK.dashboard(body.shopId, today),
  );

  const sale = await db.select().from(sales).where(eq(sales.id, saleId)).get();
  return c.json(sale!, 201);
});

salesRouter.get("/sales/:saleId", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const saleId = c.req.param("saleId");
  const [sale, items] = await Promise.all([
    db.select().from(sales).where(eq(sales.id, saleId)).get(),
    db.select().from(saleItems).where(eq(saleItems.saleId, saleId)).all(),
  ]);
  if (!sale) return c.json({ error: "Not found" }, 404);
  return c.json({ ...sale, items });
});

salesRouter.delete("/sales/:saleId", requireAuth, async (c) => {
  const body = await c.req.json<{
    reason?: string;
    performedBy?: string;
  }>().catch(() => ({})) as { reason?: string; performedBy?: string };
  const db = createDb(c.env.DB);
  const saleId = c.req.param("saleId");
  const sale = await db.select().from(sales).where(eq(sales.id, saleId)).get();
  if (!sale) return c.json({ error: "Not found" }, 404);
  const now = new Date().toISOString();

  await db
    .update(sales)
    .set({
      isDeleted: true,
      deletedAt: now,
      deleteReason: body.reason ?? null,
      deletedBy: body.performedBy ?? null,
    })
    .where(eq(sales.id, saleId));

  const items = await db.select().from(saleItems).where(eq(saleItems.saleId, saleId)).all();
  for (const item of items) {
    if (!item.productId) continue;
    const product = await db.select().from(products).where(eq(products.id, item.productId)).get();
    if (product) {
      const beforeQty = product.stockQty;
      const afterQty = beforeQty + item.qty;
      await db.update(products).set({ stockQty: afterQty, updatedAt: now }).where(eq(products.id, item.productId));
      await db.insert(inventoryMovements).values({
        id: crypto.randomUUID(),
        productId: item.productId,
        productName: product.canonicalName,
        movementType: "sale_reversal",
        qtyChange: item.qty,
        beforeQty,
        afterQty,
        source: "sale_delete",
        referenceId: saleId,
        createdBy: body.performedBy ?? null,
        createdAt: now,
      });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  await kvDel(
    c.env.SESSIONS,
    CK.products(sale.shopId),
    CK.dashboard(sale.shopId, today),
  );
  return c.body(null, 204);
});

// ─── POST /returns  (standalone — no original sale required) ─────────────────
salesRouter.post("/returns", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const body = await c.req.json<{
    shopId: string;
    productId: string;
    productName: string;
    qty: number;
    unitPrice?: number;
    reason?: string;
    processedBy?: string;
  }>();

  if (!body.productId || !body.qty || body.qty <= 0)
    return c.json({ error: "productId and qty > 0 required" }, 400);

  const now = new Date().toISOString();
  const returnId = crypto.randomUUID();

  const product = await db.select().from(products).where(eq(products.id, body.productId)).get();
  if (!product) return c.json({ error: "Product not found" }, 404);

  const beforeQty = product.stockQty;
  const afterQty = beforeQty + body.qty;
  const unitPrice = body.unitPrice ?? product.sellingPrice ?? 0;
  const refundAmount = body.qty * unitPrice;

  await db.update(products)
    .set({ stockQty: afterQty, updatedAt: now })
    .where(eq(products.id, body.productId));

  await db.insert(inventoryMovements).values({
    id: crypto.randomUUID(),
    productId: body.productId,
    productName: product.canonicalName,
    movementType: "return",
    qtyChange: body.qty,
    beforeQty,
    afterQty,
    source: "standalone_return",
    referenceId: returnId,
    createdBy: body.processedBy ?? null,
    createdAt: now,
  });

  // SQLite does not enforce FK by default — "standalone" is a valid TEXT value
  await db.insert(saleReturns).values({
    id: returnId,
    shopId: body.shopId,
    saleId: "standalone",
    itemsJson: JSON.stringify([{
      productId: body.productId,
      productName: product.canonicalName,
      qty: body.qty,
      unitPrice,
      refundAmount,
    }]),
    totalRefund: refundAmount,
    reason: body.reason ?? null,
    processedBy: body.processedBy ?? null,
    createdAt: now,
  });

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    shopId: body.shopId,
    action: "standalone_return",
    entityType: "sale_return",
    entityId: returnId,
    oldValueJson: null,
    newValueJson: JSON.stringify({
      productId: body.productId,
      productName: product.canonicalName,
      qty: body.qty,
      refundAmount,
      reason: body.reason,
    }),
    performedBy: body.processedBy ?? null,
    createdAt: now,
  });

  const today = new Date().toISOString().slice(0, 10);
  await kvDel(c.env.SESSIONS, CK.products(body.shopId), CK.dashboard(body.shopId, today));

  return c.json({ id: returnId, totalRefund: refundAmount, beforeQty, afterQty, productName: product.canonicalName }, 201);
});

// ─── GET /sales/:saleId/returns ──────────────────────────────────────────────
salesRouter.get("/sales/:saleId/returns", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const saleId = c.req.param("saleId");
  const rows = await db
    .select()
    .from(saleReturns)
    .where(eq(saleReturns.saleId, saleId))
    .all();
  return c.json(rows);
});

// ─── POST /sales/:saleId/returns ─────────────────────────────────────────────
// ─── List all returns for a shop on a date ───────────────────────────────────
salesRouter.get("/returns", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);

  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay   = `${date}T23:59:59.999Z`;

  const rows = await db
    .select()
    .from(saleReturns)
    .where(
      and(
        shopId ? eq(saleReturns.shopId, shopId) : undefined,
        gte(saleReturns.createdAt, startOfDay),
        lte(saleReturns.createdAt, endOfDay),
      )
    )
    .orderBy(sql`${saleReturns.createdAt} DESC`)
    .all();

  return c.json(rows);
});

salesRouter.post("/sales/:saleId/returns", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const saleId = c.req.param("saleId");

  const body = await c.req.json<{
    shopId: string;
    reason?: string;
    processedBy?: string;
    items: Array<{
      productId?: string | null;
      productName: string;
      qty: number;
      unitPrice: number;
      refundAmount: number;
    }>;
  }>();

  const sale = await db.select().from(sales).where(eq(sales.id, saleId)).get();
  if (!sale) return c.json({ error: "Sale not found" }, 404);
  if (sale.isDeleted) return c.json({ error: "Cannot return items from a voided sale" }, 400);
  if (!body.items || body.items.length === 0) return c.json({ error: "No items to return" }, 400);

  // ── Guard: compute already-returned qty per product for this sale ────────────
  const existingReturnRows = await db
    .select()
    .from(saleReturns)
    .where(eq(saleReturns.saleId, saleId))
    .all();

  const alreadyReturned: Record<string, number> = {};
  for (const r of existingReturnRows) {
    const ritems: any[] = (() => { try { return JSON.parse(r.itemsJson ?? "[]"); } catch { return []; } })();
    for (const ri of ritems) {
      if (ri.productId) alreadyReturned[ri.productId] = (alreadyReturned[ri.productId] ?? 0) + (ri.qty ?? 0);
    }
  }

  // ── Fetch original sold quantities ───────────────────────────────────────────
  const soldRows = await db.select().from(saleItems).where(eq(saleItems.saleId, saleId)).all();
  const soldQty: Record<string, number> = {};
  for (const si of soldRows) {
    if (si.productId) soldQty[si.productId] = (soldQty[si.productId] ?? 0) + si.qty;
  }

  // ── Validate each return item ────────────────────────────────────────────────
  for (const item of body.items) {
    if (!item.productId) continue;
    const originalQty = soldQty[item.productId] ?? 0;
    const prevReturned = alreadyReturned[item.productId] ?? 0;
    const maxReturnable = originalQty - prevReturned;
    if (item.qty > maxReturnable) {
      return c.json({
        error: `Cannot return ${item.qty}× "${item.productName}" — only ${maxReturnable} can be returned (${prevReturned} already returned of ${originalQty} sold)`,
      }, 400);
    }
  }

  const now = new Date().toISOString();
  const returnId = crypto.randomUUID();

  const totalRefund = body.items.reduce((sum, it) => sum + it.refundAmount, 0);

  // Restore stock for each returned product
  for (const item of body.items) {
    if (!item.productId) continue;
    const product = await db
      .select()
      .from(products)
      .where(eq(products.id, item.productId))
      .get();
    if (!product) continue;

    const beforeQty = product.stockQty;
    const afterQty = beforeQty + item.qty;

    await db
      .update(products)
      .set({ stockQty: afterQty, updatedAt: now })
      .where(eq(products.id, item.productId));

    await db.insert(inventoryMovements).values({
      id: crypto.randomUUID(),
      productId: item.productId,
      productName: product.canonicalName,
      movementType: "return",
      qtyChange: item.qty,
      beforeQty,
      afterQty,
      source: "sale_return",
      referenceId: returnId,
      createdBy: body.processedBy ?? null,
      createdAt: now,
    });
  }

  // Persist the return record
  await db.insert(saleReturns).values({
    id: returnId,
    shopId: body.shopId,
    saleId,
    itemsJson: JSON.stringify(body.items),
    totalRefund,
    reason: body.reason ?? null,
    processedBy: body.processedBy ?? null,
    createdAt: now,
  });

  // Audit trail
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    shopId: body.shopId,
    action: "sale_return",
    entityType: "sale_return",
    entityId: returnId,
    oldValueJson: null,
    newValueJson: JSON.stringify({ saleId, totalRefund, items: body.items, reason: body.reason }),
    performedBy: body.processedBy ?? null,
    createdAt: now,
  });

  // ── Update sale totals to reflect the return ────────────────────────────────
  const newTotal = Math.max(0, (sale.totalAmount ?? 0) - totalRefund);
  // Estimate profit reduction: refund * (totalProfit / totalAmount) if ratio available
  const profitRatio = (sale.totalAmount ?? 0) > 0
    ? (sale.totalProfit ?? 0) / (sale.totalAmount ?? 1) : 0;
  const newProfit = Math.max(0, (sale.totalProfit ?? 0) - totalRefund * profitRatio);
  await db.update(sales)
    .set({ totalAmount: newTotal, totalProfit: newProfit })
    .where(eq(sales.id, saleId));

  // Bust cache so dashboard/products reflect restored stock
  const today = new Date().toISOString().slice(0, 10);
  await kvDel(
    c.env.SESSIONS,
    CK.products(body.shopId),
    CK.dashboard(body.shopId, today),
  );

  const result = await db
    .select()
    .from(saleReturns)
    .where(eq(saleReturns.id, returnId))
    .get();
  return c.json(result!, 201);
});

export default salesRouter;
