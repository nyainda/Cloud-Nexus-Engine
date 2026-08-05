import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { kvDel, CK } from "../lib/cache";
import { products, inventoryMovements, stockTransfers } from "@workspace/db/schema";

const productsTransferRouter = new Hono<AppEnv>();

productsTransferRouter.post("/products/:productId/transfer", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const productId = c.req.param("productId");
  const session = c.get("session");

  let body: { targetShopId: string; qty: number; notes?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.targetShopId || !body.qty || body.qty <= 0) {
    return c.json({ error: "targetShopId and qty (>0) are required" }, 400);
  }
  if (body.targetShopId === session.shopId) {
    return c.json({ error: "Cannot transfer to the same shop" }, 400);
  }

  const sourceProduct = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.shopId, session.shopId)))
    .get();

  if (!sourceProduct) return c.json({ error: "Product not found" }, 404);
  if (sourceProduct.stockQty < body.qty) {
    return c.json({ error: `Insufficient stock (have ${sourceProduct.stockQty})` }, 400);
  }

  const now = new Date().toISOString();

  // Find matching product in target shop by normalized name
  let targetProduct = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.shopId, body.targetShopId),
        eq(products.normalizedName, sourceProduct.normalizedName),
        eq(products.isActive, true),
      ),
    )
    .get();

  if (!targetProduct) {
    // Create product in target shop with 0 stock — we'll update it below
    const newId = crypto.randomUUID();
    await db.insert(products).values({
      id: newId,
      shopId: body.targetShopId,
      canonicalName: sourceProduct.canonicalName,
      normalizedName: sourceProduct.normalizedName,
      sku: sourceProduct.sku ?? null,
      category: sourceProduct.category ?? null,
      unit: sourceProduct.unit ?? "unit",
      purchasePrice: sourceProduct.purchasePrice ?? null,
      sellingPrice: sourceProduct.sellingPrice ?? null,
      profitMargin: sourceProduct.profitMargin ?? null,
      stockQty: 0,
      alertQty: sourceProduct.alertQty ?? 5,
      size: sourceProduct.size ?? null,
      expiryDate: sourceProduct.expiryDate ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    targetProduct = await db
      .select()
      .from(products)
      .where(eq(products.id, newId))
      .get();
  }

  // Atomic delta operations for both legs of the transfer.
  // Avoids the read-modify-write race: each UPDATE applies its own ±delta
  // to whatever the DB currently holds, rather than overwriting with a
  // pre-read value that may be stale if another request ran concurrently.
  //
  // IMPORTANT: only stockQty is touched — prices and unit are intentionally
  // NOT synced. Each shop manages its own selling/buying prices independently.
  // A transfer is a physical stock move, not a price agreement.

  await db
    .update(products)
    .set({
      stockQty: sql`${products.stockQty} - ${body.qty}`,
      updatedAt: now,
    })
    .where(eq(products.id, productId));

  await db
    .update(products)
    .set({
      stockQty: sql`${products.stockQty} + ${body.qty}`,
      updatedAt: now,
    })
    .where(eq(products.id, targetProduct!.id));

  // Re-read committed quantities (used for inventory movement log and API response)
  const [updatedSource, updatedTarget] = await Promise.all([
    db.select({ stockQty: products.stockQty }).from(products).where(eq(products.id, productId)).get(),
    db.select({ stockQty: products.stockQty }).from(products).where(eq(products.id, targetProduct!.id)).get(),
  ]);
  const newSourceQty = updatedSource?.stockQty ?? sourceProduct.stockQty - body.qty;
  const newTargetQty = updatedTarget?.stockQty ?? (targetProduct!.stockQty ?? 0) + body.qty;

  // Bust KV product cache for both shops so next fetch reflects updated quantities
  await Promise.all([
    kvDel(c.env.SESSIONS, CK.products(session.shopId)),
    kvDel(c.env.SESSIONS, CK.products(body.targetShopId)),
  ]);

  // Inventory movement logs
  await db.insert(inventoryMovements).values({
    id: crypto.randomUUID(),
    productId,
    productName: sourceProduct.canonicalName,
    movementType: "transfer_out",
    qtyChange: -body.qty,
    beforeQty: sourceProduct.stockQty,
    afterQty: newSourceQty,
    source: "transfer",
    referenceId: targetProduct!.id,
    createdBy: null,
    createdAt: now,
  });

  await db.insert(inventoryMovements).values({
    id: crypto.randomUUID(),
    productId: targetProduct!.id,
    productName: targetProduct!.canonicalName,
    movementType: "transfer_in",
    qtyChange: body.qty,
    beforeQty: targetProduct!.stockQty,
    afterQty: newTargetQty,
    source: "transfer",
    referenceId: productId,
    createdBy: null,
    createdAt: now,
  });

  const transferId = crypto.randomUUID();
  await db.insert(stockTransfers).values({
    id: transferId,
    fromShopId: session.shopId,
    toShopId: body.targetShopId,
    fromProductId: productId,
    toProductId: targetProduct!.id,
    productName: sourceProduct.canonicalName,
    qty: body.qty,
    unit: sourceProduct.unit ?? "unit",
    notes: body.notes ?? null,
    transferredBy: session.role ?? null,
    createdAt: now,
  });

  return c.json({
    ok: true,
    transferId,
    productName: sourceProduct.canonicalName,
    sourceQtyAfter: newSourceQty,
    targetQtyAfter: newTargetQty,
    targetProductId: targetProduct!.id,
  });
});

export default productsTransferRouter;
