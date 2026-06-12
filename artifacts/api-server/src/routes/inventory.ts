import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { inventoryMovements, products } from "@workspace/db/schema";

const inventoryRouter = new Hono<AppEnv>();

inventoryRouter.get("/inventory-movements", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  const productId = c.req.query("productId");
  const movementType = c.req.query("movementType");
  const referenceId = c.req.query("referenceId");
  const limit = parseInt(c.req.query("limit") ?? "100");
  const offset = parseInt(c.req.query("offset") ?? "0");

  // Join with products to filter by shop_id — inventoryMovements has no shopId column.
  // The LEFT JOIN is used so unlinked movements (productId IS NULL) still appear when
  // no shopId filter is requested; when shopId is provided the INNER semantics apply.
  const rows = await db
    .select({
      id: inventoryMovements.id,
      productId: inventoryMovements.productId,
      productName: inventoryMovements.productName,
      movementType: inventoryMovements.movementType,
      qtyChange: inventoryMovements.qtyChange,
      beforeQty: inventoryMovements.beforeQty,
      afterQty: inventoryMovements.afterQty,
      source: inventoryMovements.source,
      referenceId: inventoryMovements.referenceId,
      createdBy: inventoryMovements.createdBy,
      createdAt: inventoryMovements.createdAt,
    })
    .from(inventoryMovements)
    .leftJoin(products, eq(inventoryMovements.productId, products.id))
    .where(
      and(
        shopId ? eq(products.shopId, shopId) : undefined,
        productId ? eq(inventoryMovements.productId, productId) : undefined,
        movementType ? eq(inventoryMovements.movementType, movementType as any) : undefined,
        referenceId ? eq(inventoryMovements.referenceId, referenceId) : undefined,
      ),
    )
    .orderBy(sql`${inventoryMovements.createdAt} DESC`)
    .limit(limit)
    .offset(offset)
    .all();

  return c.json(rows);
});

export default inventoryRouter;
