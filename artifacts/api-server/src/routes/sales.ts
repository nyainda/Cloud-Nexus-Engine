import { Hono } from "hono";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { sales, saleItems, products, debts, inventoryMovements, notifications } from "@workspace/db/schema";

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

  const sale = await db.select().from(sales).where(eq(sales.id, saleId)).get();
  return c.json(sale!, 201);
});

salesRouter.get("/sales/:saleId", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const sale = await db
    .select()
    .from(sales)
    .where(eq(sales.id, c.req.param("saleId")))
    .get();
  if (!sale) return c.json({ error: "Not found" }, 404);
  const items = await db
    .select()
    .from(saleItems)
    .where(eq(saleItems.saleId, sale.id))
    .all();
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

  return c.body(null, 204);
});

export default salesRouter;
