import { Hono } from "hono";
import { eq, or, desc, and } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { kvDel, CK } from "../lib/cache";
import { stockTransfers, products } from "@workspace/db/schema";

const transfersRouter = new Hono<AppEnv>();

transfersRouter.get("/transfers", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  const limit = parseInt(c.req.query("limit") ?? "200");

  if (!shopId) return c.json({ error: "shopId required" }, 400);

  const rows = await db
    .select()
    .from(stockTransfers)
    .where(
      or(
        eq(stockTransfers.fromShopId, shopId),
        eq(stockTransfers.toShopId, shopId),
      ),
    )
    .orderBy(desc(stockTransfers.createdAt))
    .limit(limit)
    .all();

  return c.json(rows);
});

transfersRouter.delete("/transfers/:id", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const id = c.req.param("id");

  const transfer = await db
    .select()
    .from(stockTransfers)
    .where(eq(stockTransfers.id, id))
    .get();

  if (!transfer) return c.json({ error: "Transfer not found" }, 404);

  if (transfer.fromShopId !== session.shopId) {
    return c.json({ error: "Only the sending shop can cancel a transfer" }, 403);
  }

  const toProduct = await db
    .select()
    .from(products)
    .where(and(eq(products.id, transfer.toProductId), eq(products.shopId, transfer.toShopId)))
    .get();

  if (!toProduct) {
    return c.json({ error: "Destination product no longer exists" }, 400);
  }

  if ((toProduct.stockQty ?? 0) < transfer.qty) {
    return c.json({
      error: `Cannot reverse: destination shop only has ${toProduct.stockQty ?? 0} ${toProduct.unit ?? "units"} remaining (need ${transfer.qty})`,
    }, 400);
  }

  const fromProduct = await db
    .select()
    .from(products)
    .where(and(eq(products.id, transfer.fromProductId), eq(products.shopId, transfer.fromShopId)))
    .get();

  const now = new Date().toISOString();

  if (fromProduct) {
    await db
      .update(products)
      .set({ stockQty: (fromProduct.stockQty ?? 0) + transfer.qty, updatedAt: now })
      .where(eq(products.id, fromProduct.id))
      .run();
  }

  await db
    .update(products)
    .set({ stockQty: (toProduct.stockQty ?? 0) - transfer.qty, updatedAt: now })
    .where(eq(products.id, toProduct.id))
    .run();

  await db.delete(stockTransfers).where(eq(stockTransfers.id, id)).run();

  // Bust KV cache for both shops so restored quantities show immediately
  await Promise.all([
    kvDel(c.env.SESSIONS, CK.products(transfer.fromShopId)),
    kvDel(c.env.SESSIONS, CK.products(transfer.toShopId)),
  ]);

  return c.json({ ok: true, restored: transfer.qty, unit: transfer.unit });
});

export default transfersRouter;
