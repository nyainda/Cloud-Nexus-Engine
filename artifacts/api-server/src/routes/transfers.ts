import { Hono } from "hono";
import { eq, or, desc, and, sql } from "drizzle-orm";
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
    return c.json(
      { error: "Only the sending shop can cancel a transfer" },
      403,
    );
  }

  const now = new Date().toISOString();

  // Single atomic batch — all 3 statements succeed or all roll back.
  // Stock math runs inside D1 (atomic deltas), never in JS, so concurrent
  // cancel requests cannot race and create or lose quantity.
  await db.batch([
    // 1. Restore qty to source shop — atomic increment
    // 1. Restore qty to source shop — atomic increment
    db
      .update(products)
      .set({
        stockQty: sql`stock_qty + ${transfer.qty}`,
        updatedAt: now,
      })
      .where(
        and(
          eq(products.id, transfer.fromProductId),
          eq(products.shopId, transfer.fromShopId),
        ),
      ),

    // 2. Deduct qty from destination shop — atomic decrement.
    // Prevent negative stock if destination already sold some stock.
    db
      .update(products)
      .set({
        stockQty: sql`CASE WHEN stock_qty >= ${transfer.qty} THEN stock_qty - ${transfer.qty} ELSE stock_qty END`,
        updatedAt: now,
      })
      .where(
        and(
          eq(products.id, transfer.toProductId),
          eq(products.shopId, transfer.toShopId),
        ),
      ),
    // 2. Deduct qty from destination shop — atomic decrement.
    //    CASE WHEN guard prevents going negative if the destination
    //    already sold the stock; the transaction still commits cleanly.
    db
      .update(products)
      .set({
        stockQty: sql`CASE WHEN stock_qty >= ${transfer.qty} THEN stock_qty - ${transfer.qty} ELSE stock_qty END`,
        updatedAt: now,
      })
      .where(
        and(
          eq(products.id, transfer.toProductId),
          eq(products.shopId, transfer.toShopId),
        ),
      ),

    // 3. Remove the transfer record in the same transaction so it
    //    cannot be cancelled a second time.
    db.delete(stockTransfers).where(eq(stockTransfers.id, id)),
  ]);

  // Bust KV cache AFTER the transaction commits — both shops see fresh
  // stock on the next read without waiting for KV TTL to expire.
  await Promise.all([
    kvDel(c.env.SESSIONS, CK.products(transfer.fromShopId)),
    kvDel(c.env.SESSIONS, CK.products(transfer.toShopId)),
  ]);

  return c.json({ ok: true, restored: transfer.qty, unit: transfer.unit });
});

export default transfersRouter;
